'use client';

export default function TestPage({ triggerEvent }: { triggerEvent: any }) {
  return (
    <>
      <button onClick={() => triggerEvent()}>Event (server action)</button>
      <button data-event="yolo" data-yolo="123" data-hihi="taaa-daaaaa">
        Event (data-attributes)
      </button>
    </>
  );
}
