import { useCallback, useRef, useState } from 'react';
import { MapSheet as SharedMapSheet, MapSurface as SharedMapSurface } from './CampusMap';
import type { CampusMapEngine } from './map-engine';
import { WorkoutControls } from './WorkoutControls';

type SurfaceProps = Parameters<typeof SharedMapSurface>[0];

/** Only desktop entry points import this module. The public map has no workout dependency. */
function DesktopMap({ sheet, ...props }: SurfaceProps & { sheet: boolean }) {
  const [engine, setEngine] = useState<CampusMapEngine>();
  const onEngine = useRef(props.onEngine);
  onEngine.current = props.onEngine;
  const receiveEngine = useCallback((next: CampusMapEngine | undefined) => {
    setEngine(next);
    onEngine.current?.(next);
  }, []);
  const Surface = sheet ? SharedMapSheet : SharedMapSurface;
  return <Surface {...props} onEngine={receiveEngine} footerControls={props.publicOnly ? undefined : <>
    {props.footerControls}
    <WorkoutControls engine={engine} mapOnly={props.inline} />
  </>} />;
}

export function MapSheet(props: SurfaceProps) { return <DesktopMap {...props} sheet />; }
export function MapSurface(props: SurfaceProps) { return <DesktopMap {...props} sheet={false} />; }
