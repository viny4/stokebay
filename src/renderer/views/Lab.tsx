// A project's Lab: a full-screen canvas where every resource is an object. App shows this
// instead of the HUD while store.view === 'lab'.
import { ReactFlowProvider } from '@xyflow/react';
import { LabHeader } from '../components/lab/LabHeader';
import { LabWorkspace } from '../components/lab/LabWorkspace';
import { useHud } from '../store/useHud';

export function Lab() {
  const lab = useHud((s) => s.lab);
  const labProjectId = useHud((s) => s.labProjectId);
  const exitLab = useHud((s) => s.exitLab);
  const project = useHud((s) => s.projects.find((p) => p.id === s.labProjectId) ?? null);

  if (!lab || lab.project.id !== labProjectId) {
    return (
      <div className="flex h-full flex-col">
        <LabHeader project={project} partsOpen={false} tools={null} onBack={exitLab} />
        <div aria-busy="true" className="flex flex-1 items-center justify-center">
          <p className="animate-pulse font-hud text-sm tracking-[0.3em] text-hud-muted uppercase">
            Powering up the Lab…
          </p>
        </div>
      </div>
    );
  }

  // Keyed by project so a different Lab starts with a fresh canvas and viewport.
  return (
    <ReactFlowProvider key={lab.project.id}>
      <LabWorkspace lab={lab} />
    </ReactFlowProvider>
  );
}
