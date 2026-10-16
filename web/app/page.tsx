"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getState,
  launchApp,
  sendKey,
  sendText,
  type KeyDirection,
  type StbState,
} from "@/lib/api";

const POLL_MS = 2000;
const HOLD_MS = 180;

const COMMON_APPS = [
  { label: "Spotify", app: "com.spotify.tv.android" },
  { label: "YouTube", app: "com.google.android.youtube.tv" },
  { label: "Netflix", app: "com.netflix.ninja" },
  { label: "Prime Video", app: "com.amazon.amazonvideo.livingroom" },
  { label: "Hotstar", app: "in.startv.hotstar" },
  { label: "Xstream", app: "com.airtel.tv" },
];

/** Mirrors what a physical remote gives you for free. */
const KEY_BINDINGS: Record<string, string> = {
  ArrowUp: "DPAD_UP",
  ArrowDown: "DPAD_DOWN",
  ArrowLeft: "DPAD_LEFT",
  ArrowRight: "DPAD_RIGHT",
  Enter: "DPAD_CENTER",
  Backspace: "BACK",
  Escape: "BACK",
  " ": "MEDIA_PLAY_PAUSE",
  m: "VOLUME_MUTE",
  p: "POWER",
  "+": "VOLUME_UP",
  "=": "VOLUME_UP",
  "-": "VOLUME_DOWN",
  "_": "VOLUME_DOWN",
};

type KeyProps = {
  flash: string | null;
  disabled: boolean;
  onPress: (key: string) => void;
  onStartHold: (key: string) => void;
  onStopHold: () => void;
};

type RemoteKeyProps = KeyProps & {
  label: string;
  keyName: string;
  /** Hold-to-repeat, for rockers like volume and channel. */
  repeat?: boolean;
  className?: string;
  title?: string;
};

function RemoteKey({
  label,
  keyName,
  flash,
  disabled,
  onPress,
  onStartHold,
  onStopHold,
  repeat = false,
  className,
  title,
}: RemoteKeyProps) {
  const interaction: React.ComponentProps<"button"> = repeat
    ? {
        onPointerDown: (event) => {
          // Suppress the default so a long press does not start a text selection or drag.
          event.preventDefault();
          onStartHold(keyName);
        },
        onPointerUp: onStopHold,
        onPointerLeave: onStopHold,
        onPointerCancel: onStopHold,
      }
    : { onClick: () => onPress(keyName) };

  return (
    <button
      type="button"
      className={`key${className ? ` ${className}` : ""}`}
      title={title ?? keyName}
      disabled={disabled}
      data-flash={flash === keyName ? "true" : undefined}
      {...interaction}
    >
      {label}
    </button>
  );
}

export default function RemotePage() {
  const [state, setState] = useState<StbState | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [app, setApp] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const holdTimer = useRef<number | null>(null);
  const flashTimer = useRef<number | null>(null);

  const press = useCallback((key: string, direction: KeyDirection = "SHORT") => {
    setFlash(key);

    if (flashTimer.current !== null) {
      window.clearTimeout(flashTimer.current);
    }

    flashTimer.current = window.setTimeout(() => setFlash(null), 140);

    void sendKey(key, direction)
      .then(() => setActionError(null))
      .catch((cause: unknown) =>
        setActionError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, []);

  const stopHold = useCallback(() => {
    if (holdTimer.current !== null) {
      window.clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  const startHold = useCallback(
    (key: string) => {
      press(key);
      stopHold();

      // The protocol sends discrete presses, so a "held" rocker is repeated presses.
      holdTimer.current = window.setInterval(() => press(key), HOLD_MS);
    },
    [press, stopHold],
  );

  // Poll the device. Only GET /state is polled — the write endpoints are driven by the user.
  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      try {
        const next = await getState();

        if (!cancelled) {
          setState(next);
          setLinkError(null);
        }
      } catch (cause) {
        if (!cancelled) {
          setLinkError(cause instanceof Error ? cause.message : String(cause));
        }
      }
    };

    void tick();
    const id = window.setInterval(tick, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => stopHold, [stopHold]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;

      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") {
        return;
      }

      const key = KEY_BINDINGS[event.key];

      if (key) {
        event.preventDefault();
        press(key);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [press]);

  const run = useCallback((action: () => Promise<unknown>, done?: () => void) => {
    void action()
      .then(() => {
        setActionError(null);
        done?.();
      })
      .catch((cause: unknown) =>
        setActionError(cause instanceof Error ? cause.message : String(cause)),
      );
  }, []);

  const connected = state?.connected ?? false;

  const keyProps: KeyProps = {
    flash,
    disabled: !connected,
    onPress: press,
    onStartHold: startHold,
    onStopHold: stopHold,
  };

  const powerLabel =
    state?.isOn == null ? "unknown" : state.isOn ? "on" : "standby";

  const volumeLabel = state?.volume
    ? `${state.volume.level} / ${state.volume.max}${state.volume.muted ? " · muted" : ""}`
    : "unknown";

  return (
    <div className="shell">
      <main className="remote">
        <section className="status">
          <div className="status-row">
            <span className="status-key">Device</span>
            <span className="status-value">
              <span className="dot" data-state={connected ? "on" : "off"} />
              {connected ? "connected" : "disconnected"}
            </span>
          </div>
          <div className="status-row">
            <span className="status-key">Power</span>
            <span className="status-value">{powerLabel}</span>
          </div>
          <div className="status-row">
            <span className="status-key">Volume</span>
            <span className="status-value">{volumeLabel}</span>
          </div>
          <div className="status-row">
            <span className="status-key">App</span>
            <span className="status-value">{state?.currentApp ?? "unknown"}</span>
          </div>
          <div className="status-row">
            <span className="status-key">Model</span>
            <span className="status-value">
              {state?.device
                ? `${state.device.manufacturer} ${state.device.model}`
                : "unknown"}
            </span>
          </div>
        </section>

        {actionError ?? linkError ? (
          <div className="banner banner-error">
            <span>{actionError ?? linkError}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => {
                setActionError(null);
                setLinkError(null);
              }}
            >
              ✕
            </button>
          </div>
        ) : null}

        {!connected && !linkError ? (
          <div className="banner banner-warn">
            <span>
              No live session. The box may be off, asleep, or already held by another remote —
              the API redials every few seconds.
            </span>
          </div>
        ) : null}

        <section className="card">
          <h2 className="card-title">Power</h2>
          <div className="grid cols-3">
            <RemoteKey label="⏻" keyName="POWER" className="key-power" title="Power" {...keyProps} />
            <RemoteKey label="🔇" keyName="VOLUME_MUTE" className="key-mute" title="Mute" {...keyProps} />
            <RemoteKey label="Input" keyName="TV_INPUT" {...keyProps} />
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Navigate</h2>
          <div className="dpad">
            <span />
            <RemoteKey label="▲" keyName="DPAD_UP" {...keyProps} />
            <span />
            <RemoteKey label="◀" keyName="DPAD_LEFT" {...keyProps} />
            <RemoteKey label="OK" keyName="DPAD_CENTER" className="ok" {...keyProps} />
            <RemoteKey label="▶" keyName="DPAD_RIGHT" {...keyProps} />
            <span />
            <RemoteKey label="▼" keyName="DPAD_DOWN" {...keyProps} />
            <span />
          </div>
          <div className="grid cols-4 stacked">
            <RemoteKey label="Back" keyName="BACK" {...keyProps} />
            <RemoteKey label="Home" keyName="HOME" {...keyProps} />
            <RemoteKey label="Search" keyName="SEARCH" {...keyProps} />
            <RemoteKey label="Settings" keyName="SETTINGS" {...keyProps} />
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Volume &amp; channel</h2>
          <div className="grid cols-4">
            <RemoteKey label="Vol +" keyName="VOLUME_UP" repeat {...keyProps} />
            <RemoteKey label="Vol −" keyName="VOLUME_DOWN" repeat {...keyProps} />
            <RemoteKey label="Ch +" keyName="CHANNEL_UP" repeat {...keyProps} />
            <RemoteKey label="Ch −" keyName="CHANNEL_DOWN" repeat {...keyProps} />
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Playback</h2>
          <div className="grid cols-4">
            <RemoteKey label="⏮" keyName="MEDIA_PREVIOUS" {...keyProps} />
            <RemoteKey label="◀◀" keyName="MEDIA_REWIND" repeat {...keyProps} />
            <RemoteKey label="▶▶" keyName="MEDIA_FAST_FORWARD" repeat {...keyProps} />
            <RemoteKey label="⏭" keyName="MEDIA_NEXT" {...keyProps} />
            <RemoteKey label="Play/Pause" keyName="MEDIA_PLAY_PAUSE" {...keyProps} />
            <RemoteKey label="Stop" keyName="MEDIA_STOP" {...keyProps} />
            <RemoteKey label="Info" keyName="INFO" {...keyProps} />
            <RemoteKey label="Delete" keyName="DEL" {...keyProps} />
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Apps</h2>
          <div className="grid cols-3">
            {COMMON_APPS.map((entry) => (
              <button
                key={entry.app}
                type="button"
                className="key"
                disabled={!connected}
                title={entry.app}
                onClick={() => run(() => launchApp(entry.app))}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <form
            className="field-row stacked"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => launchApp(app.trim()), () => setApp(""));
            }}
          >
            <input
              type="text"
              placeholder="or any package / link"
              value={app}
              onChange={(event) => setApp(event.target.value)}
            />
            <button type="submit" className="key key-inline" disabled={app.trim() === "" || !connected}>
              Launch
            </button>
          </form>
          <p className="hint">
            Launching is fire-and-forget: a package that is not installed does nothing, and the
            device never says so. Watch the App row above to see what actually happened.
          </p>
        </section>

        <section className="card">
          <h2 className="card-title">Keyboard → device</h2>
          <form
            className="field-row"
            onSubmit={(event) => {
              event.preventDefault();
              run(() => sendText(text), () => setText(""));
            }}
          >
            <input
              type="text"
              placeholder="type into the focused field"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            <button type="submit" className="key key-inline" disabled={text === "" || !connected}>
              Send
            </button>
          </form>
        </section>

        <section className="card">
          <h2 className="card-title">Shortcuts</h2>
          <p className="hint">
            <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd> navigate · <kbd>Enter</kbd> OK ·{" "}
            <kbd>Backspace</kbd> back · <kbd>Space</kbd> play/pause · <kbd>M</kbd> mute ·{" "}
            <kbd>P</kbd> power · <kbd>+</kbd> <kbd>−</kbd> volume
          </p>
          {state?.features.length ? (
            <p className="hint">
              Device negotiated: {state.features.join(", ").toLowerCase()}
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
