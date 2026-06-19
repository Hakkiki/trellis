// Command trellisctl drives the Trellis reconcile spine against the simulated
// cloud and prints a timeline — the build-sequence step-1 loop made tangible in
// the terminal. It is one of three targets for the same core: this CLI for
// dev/test, a future WASM build that drives the browser simulator UI, and a
// future native server that drives a real cloud (AWS) — all over the same
// provider port.
package main

import (
	"context"
	"fmt"
	"os"

	"github.com/hakkiki/trellis/model"
	"github.com/hakkiki/trellis/provider/sim"
	"github.com/hakkiki/trellis/reconcile"
)

func main() {
	ctx := context.Background()
	cloud := sim.New(sim.WithApplyLatency(2))
	rec := reconcile.New(cloud, reconcile.Options{DriftPolicy: reconcile.Enforce})

	m := model.Manifest{
		Generation: 1,
		Resources: map[model.ResourceID]model.DesiredResource{
			"web": {ID: "web", Kind: "compute", Generation: 1, Spec: model.Spec{"replicas": "2", "size": "small"}},
			"db":  {ID: "db", Kind: "managed-relational-db", Generation: 1, Spec: model.Spec{"engine": "postgres", "size": "medium"}},
		},
	}

	step := 0
	tick := func(label string) {
		st, err := rec.Step(ctx, m, cloud.Now())
		if err != nil {
			fmt.Fprintln(os.Stderr, "error:", err)
			os.Exit(1)
		}
		fmt.Printf("\n— t%-2d %s\n", step, label)
		for _, s := range st {
			fmt.Printf("    %-4s %-11s %-7s %s\n", s.ID, s.State, s.Action, s.Reason)
		}
		cloud.Tick()
		step++
	}

	fmt.Println("Trellis reconcile spine — simulated cloud")
	fmt.Println("Posture → (hand-written manifest, gen 1) → reconcile loop")

	// 1) Converge from scratch.
	for i := 0; i < 4 && !converged(ctx, rec, m, cloud); i++ {
		tick("reconcile")
	}

	// 2) Drift: hand-edit the db out of band.
	fmt.Println("\n>> injecting drift: db size hand-edited to 'tiny' (out of band)")
	cloud.InjectDrift("db", func(sp model.Spec) { sp["size"] = "tiny" })
	for i := 0; i < 4 && !converged(ctx, rec, m, cloud); i++ {
		tick("after drift")
	}

	// 3) Self-heal: a node dies.
	fmt.Println("\n>> failing node: web (health → degraded)")
	cloud.FailNode("web")
	for i := 0; i < 4 && !converged(ctx, rec, m, cloud); i++ {
		tick("after failure")
	}

	fmt.Println("\nconverged and holding.")
}

func converged(ctx context.Context, rec *reconcile.Reconciler, m model.Manifest, cloud *sim.Sim) bool {
	st, err := rec.Step(ctx, m, cloud.Now())
	if err != nil {
		return false
	}
	return reconcile.Converged(st)
}
