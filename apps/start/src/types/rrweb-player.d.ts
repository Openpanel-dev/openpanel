declare module 'rrweb-player' {
  interface RrwebPlayerProps {
    events: Array<{ type: number; data: unknown; timestamp: number }>;
    width?: number;
    height?: number;
    autoPlay?: boolean;
    showController?: boolean;
    speedOption?: number[];
  }

  interface RrwebPlayerOptions {
    target: HTMLElement;
    props: RrwebPlayerProps;
  }

  interface RrwebReplayer {
    getCurrentTime: () => number;
  }

  interface RrwebPlayerMetaData {
    startTime: number;
    endTime: number;
    totalTime: number;
  }

  interface RrwebPlayerInstance {
    play: () => void;
    pause: () => void;
    toggle: () => void;
    goto: (timeOffset: number, play?: boolean) => void;
    setSpeed: (speed: number) => void;
    getMetaData: () => RrwebPlayerMetaData;
    getReplayer: () => RrwebReplayer;
    addEventListener?: (
      event: string,
      handler: (...args: unknown[]) => void,
    ) => void;
    $destroy?: () => void;
  }

  const rrwebPlayer: new (options: RrwebPlayerOptions) => RrwebPlayerInstance;
  export default rrwebPlayer;
}
