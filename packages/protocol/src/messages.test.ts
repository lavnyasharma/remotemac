import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMessage, serializeMessage, ProtocolValidationError } from "./messages.js";
import { PROTOCOL_VERSION } from "./envelope.js";

test("parses a valid terminal.input message", () => {
  const message = parseMessage({
    protocolVersion: PROTOCOL_VERSION,
    type: "terminal.input",
    payload: { data: "ls -la\n" },
  });

  assert.equal(message.type, "terminal.input");
  assert.deepEqual(message.payload, { data: "ls -la\n" });
});

test("round-trips through serializeMessage", () => {
  const message = parseMessage({
    protocolVersion: PROTOCOL_VERSION,
    type: "terminal.resize",
    payload: { columns: 120, rows: 40 },
  });

  const json = serializeMessage(message);
  const reparsed = parseMessage(JSON.parse(json));
  assert.deepEqual(reparsed, message);
});

test("rejects an unknown message type", () => {
  assert.throws(
    () => parseMessage({ protocolVersion: PROTOCOL_VERSION, type: "not.real", payload: {} }),
    ProtocolValidationError,
  );
});

test("rejects a mismatched protocol version", () => {
  assert.throws(
    () => parseMessage({ protocolVersion: 999, type: "terminal.input", payload: { data: "x" } }),
    ProtocolValidationError,
  );
});

test("rejects a payload that fails schema validation", () => {
  assert.throws(
    () =>
      parseMessage({
        protocolVersion: PROTOCOL_VERSION,
        type: "mouse.move",
        payload: { x: 2, y: 0.5 },
      }),
    ProtocolValidationError,
  );
});

test("rejects a non-object message", () => {
  assert.throws(() => parseMessage("not an object"), ProtocolValidationError);
});

test("parses a pair.incoming notification", () => {
  const message = parseMessage({
    protocolVersion: PROTOCOL_VERSION,
    type: "pair.incoming",
    payload: {
      devicePairId: "8d5f3e10-4b3a-4b7a-9c3e-1a2b3c4d5e6f",
      remoteDeviceId: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      remoteDeviceName: "Lavanya's iPhone",
    },
  });

  assert.equal(message.type, "pair.incoming");
});

test("parses an error message", () => {
  const message = parseMessage({
    protocolVersion: PROTOCOL_VERSION,
    type: "error",
    payload: { message: "Unsupported message type" },
  });

  assert.equal(message.type, "error");
});
