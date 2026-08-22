import { useEffect, useRef } from "react";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:4000";

/**
 * Subscribes to real-time seat/waitlist updates for one event. The backend
 * is still the source of truth (this just saves a poll) -- if the socket
 * disconnects, a page refresh will always show the correct state because
 * every mutating action re-fetches from the REST API too.
 */
export function useEventSocket(eventId, { onSeatUpdate, onWaitlistUpdate } = {}) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!eventId) return undefined;
    const socket = io(SOCKET_URL, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.emit("subscribe", eventId);
    if (onSeatUpdate) socket.on("seat:update", onSeatUpdate);
    if (onWaitlistUpdate) socket.on("waitlist:update", onWaitlistUpdate);

    return () => {
      socket.emit("unsubscribe", eventId);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);
}
