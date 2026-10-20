// Formerly the animated grid behind the Ignite screen. The New project sheet now sits on the
// plain canvas, so this is just a flat backdrop; it is kept so existing imports still work.
import { memo } from 'react';

export const BlueprintGrid = memo(function BlueprintGrid({ animate }: { animate: boolean }) {
  void animate; // No intro animation any more; the prop is accepted for compatibility.
  return <div aria-hidden className="pointer-events-none absolute inset-0 bg-canvas" />;
});
