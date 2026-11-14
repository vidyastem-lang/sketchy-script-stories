export interface SceneTimeline {
  starts: number[];
  totalDuration: number;
  transitionDuration: number;
}

export function calculateSceneTimeline(
  sceneDurations: number[],
  requestedTransitionDuration: number,
): SceneTimeline {
  if (sceneDurations.length === 0) throw new Error("A scene timeline needs at least one scene");
  if (sceneDurations.some((duration) => !Number.isFinite(duration) || duration <= 0)) {
    throw new Error("Every scene duration must be a positive finite number");
  }
  if (!Number.isFinite(requestedTransitionDuration) || requestedTransitionDuration < 0) {
    throw new Error("Transition duration must be a non-negative finite number");
  }

  const shortestScene = Math.min(...sceneDurations);
  const transitionDuration =
    sceneDurations.length === 1 ? 0 : Math.min(requestedTransitionDuration, shortestScene / 3);
  const starts: number[] = [];
  let cursor = 0;
  sceneDurations.forEach((duration, index) => {
    starts.push(cursor);
    cursor += duration;
    if (index < sceneDurations.length - 1) cursor -= transitionDuration;
  });
  return { starts, totalDuration: cursor, transitionDuration };
}
