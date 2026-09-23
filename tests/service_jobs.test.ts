import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { test } from "node:test";
import { extractDocxPreviewText, validateDocxPackage } from "../src/lib/docxPreview.ts";

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

test("loopback job API verifies origin, session, binary results and cancellation", { timeout: 30_000 }, async () => {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const bundled = path.resolve("runtime/python/python.exe");
  const python = process.platform === "win32" && existsSync(bundled) ? bundled : "python3";
  const launch = () => spawn(python, ["service/engine_b_service.py"], {
    cwd: process.cwd(),
    env: { ...process.env, XREMOVE_PORT: String(port), XREMOVE_UI_PATH: path.resolve("index.html") },
    stdio: "ignore",
    windowsHide: true,
  });
  let service = launch();
  try {
    let health: Response | undefined;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        health = await fetch(`${origin}/api/health`);
        break;
      } catch {
        if (service.exitCode !== null) throw new Error(`Service exited: ${service.exitCode}`);
        await delay(50);
      }
    }
    assert.ok(health?.ok, "service started");
    assert.equal((await health.json()).service, "xremove-local-jobs");
    const badHost = await new Promise<number>((resolve, reject) => {
      http.get({ hostname: "127.0.0.1", port, path: "/api/health", headers: { Host: "evil.test" } },
        (response) => { response.resume(); resolve(response.statusCode || 0); }).on("error", reject);
    });
    assert.equal(badHost, 403);
    assert.equal((await fetch(`${origin}/api/session`, { headers: { Origin: "https://evil.test" } })).status, 403);
    const session = await (await fetch(`${origin}/api/session`)).json();
    assert.equal(typeof session.token, "string");
    const headers = {
      Origin: origin,
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent("Tiếng Việt.txt"),
      "X-File-Type": "text/plain",
    };
    const body = Buffer.from("Tiếng Việt: ấ é 👩‍💻 می‌روم\n", "utf8");
    assert.equal((await fetch(`${origin}/api/jobs`, { method: "POST", headers: { ...headers, Origin: "https://evil.test" }, body })).status, 403);
    assert.equal((await fetch(`${origin}/api/jobs`, { method: "POST", headers: { ...headers, Authorization: "Bearer invalid" }, body })).status, 401);
    assert.equal((await fetch(`${origin}/api/jobs`, { method: "POST", headers, body: Buffer.alloc(0) })).status, 413);
    const created = await fetch(`${origin}/api/jobs`, { method: "POST", headers, body });
    assert.equal(created.status, 202);
    const job = await created.json();
    assert.match(job.id, /^[0-9a-f]{32}$/);
    let state = job;
    for (let attempt = 0; attempt < 100 && !["done", "error"].includes(state.status); attempt++) {
      await delay(50);
      state = await (await fetch(`${origin}/api/jobs/${job.id}`, { headers })).json();
    }
    assert.equal(state.status, "done", state.error);
    const result = await fetch(`${origin}/api/jobs/${job.id}/result`, { headers });
    assert.equal(result.status, 200);
    assert.equal(await result.text(), body.toString("utf8"));
    assert.equal((await fetch(`${origin}/api/jobs/${job.id}`, { method: "DELETE", headers })).status, 200);

    const video = readFileSync(path.resolve("tests/fixtures/sample.mp4"));
    const videoHeaders = { ...headers, "X-File-Name": "sample.mp4", "X-File-Type": "video/mp4" };
    const createdVideo = await fetch(`${origin}/api/jobs`, { method: "POST", headers: videoHeaders, body: video });
    assert.equal(createdVideo.status, 202);
    const videoJob = await createdVideo.json();
    let videoState = videoJob;
    for (let attempt = 0; attempt < 200 && !["done", "error"].includes(videoState.status); attempt++) {
      await delay(50);
      videoState = await (await fetch(`${origin}/api/jobs/${videoJob.id}`, { headers })).json();
    }
    assert.equal(videoState.status, "done", videoState.error);
    assert.equal(videoState.report?.kind, "av");
    const videoResult = Buffer.from(await (await fetch(`${origin}/api/jobs/${videoJob.id}/result`, { headers })).arrayBuffer());
    assert.equal(videoResult.subarray(4, 8).toString(), "ftyp");

    // Metadata-only mode removes an embedded JPEG APP1 segment without running the pixel cleaner.
    const jpeg = readFileSync(path.resolve("tests/fixtures/sample.jpg"));
    const marker = Buffer.from("Exif\0\0AI-test-author=Example", "ascii");
    const app1 = Buffer.alloc(marker.length + 4);
    app1[0] = 0xff; app1[1] = 0xe1;
    app1.writeUInt16BE(marker.length + 2, 2);
    marker.copy(app1, 4);
    const taggedJpeg = Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
    const metaHeaders = { ...headers, "X-File-Name": "sample.jpg", "X-File-Type": "image/jpeg", "X-Operation": "metadata" };
    assert.equal((await fetch(`${origin}/api/jobs`, { method: "POST", headers: { ...metaHeaders, "X-Operation": "invalid" }, body: taggedJpeg })).status, 400);
    const metaCreated = await fetch(`${origin}/api/jobs`, { method: "POST", headers: metaHeaders, body: taggedJpeg });
    assert.equal(metaCreated.status, 202);
    const metaJob = await metaCreated.json();
    let metaState = metaJob;
    for (let attempt = 0; attempt < 200 && !["done", "error"].includes(metaState.status); attempt++) {
      await delay(50);
      metaState = await (await fetch(`${origin}/api/jobs/${metaJob.id}`, { headers })).json();
    }
    assert.equal(metaState.status, "done", metaState.error);
    assert.equal(metaState.report?.operation, "metadata");
    const cleanJpeg = Buffer.from(await (await fetch(`${origin}/api/jobs/${metaJob.id}/result`, { headers })).arrayBuffer());
    assert.equal(cleanJpeg.subarray(0, 2).toString("hex"), "ffd8");
    assert.equal(cleanJpeg.includes(marker), false);
    assert.equal(cleanJpeg.subarray(-2).toString("hex"), "ffd9", "JPEG remains structurally complete");

    const docx = readFileSync(path.resolve("tests/fixtures/real_vietnamese_test.docx"));
    const docxHeaders = {
      ...headers,
      "X-File-Name": "real_vietnamese_test.docx",
      "X-File-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    const createdDocx = await fetch(`${origin}/api/jobs`, { method: "POST", headers: docxHeaders, body: docx });
    assert.equal(createdDocx.status, 202);
    const docxJob = await createdDocx.json();
    let docxState = docxJob;
    for (let attempt = 0; attempt < 200 && !["done", "error"].includes(docxState.status); attempt++) {
      await delay(50);
      docxState = await (await fetch(`${origin}/api/jobs/${docxJob.id}`, { headers })).json();
    }
    assert.equal(docxState.status, "done", docxState.error);
    const docxResult = new Uint8Array(await (await fetch(`${origin}/api/jobs/${docxJob.id}/result`, { headers })).arrayBuffer());
    assert.equal((await validateDocxPackage(docxResult.buffer)).valid, true);
    const originalText = await extractDocxPreviewText(new Uint8Array(docx).buffer);
    const cleanedText = await extractDocxPreviewText(docxResult.buffer);
    assert.equal(cleanedText, originalText.replace(/[\u200B\u200C\u200D\u2060\uFEFF]/g, ""));

    const metadataDocx = await fetch(`${origin}/api/jobs`, {
      method: "POST", headers: { ...docxHeaders, "X-Operation": "metadata" }, body: docx,
    });
    assert.equal(metadataDocx.status, 202);
    const metadataDocxId = (await metadataDocx.json()).id;
    let metadataDocxState: { status: string; error?: string; report?: { operation?: string } } = { status: "queued" };
    for (let attempt = 0; attempt < 200 && !["done", "error"].includes(metadataDocxState.status); attempt++) {
      await delay(50);
      metadataDocxState = await (await fetch(`${origin}/api/jobs/${metadataDocxId}`, { headers })).json();
    }
    assert.equal(metadataDocxState.status, "done", metadataDocxState.error);
    assert.equal(metadataDocxState.report?.operation, "metadata");
    const metadataDocxBytes = new Uint8Array(await (await fetch(`${origin}/api/jobs/${metadataDocxId}/result`, { headers })).arrayBuffer());
    assert.equal((await validateDocxPackage(metadataDocxBytes.buffer)).valid, true);
    assert.equal(await extractDocxPreviewText(metadataDocxBytes.buffer), originalText, "metadata mode keeps visible text and invisible characters");

    const large = Buffer.alloc(10 * 1024 * 1024, 65);
    const queued = await (await fetch(`${origin}/api/jobs`, { method: "POST", headers, body: large })).json();
    assert.match(queued.id, /^[0-9a-f]{32}$/);
    let running = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      const status = await (await fetch(`${origin}/api/jobs/${queued.id}`, { headers })).json();
      if (status.status === "running") { running = true; break; }
      await delay(10);
    }
    assert.ok(running, "job entered running state before cancellation");
    const healthStart = Date.now();
    assert.equal((await fetch(`${origin}/api/health`)).status, 200);
    assert.ok(Date.now() - healthStart < 1000, "health remains responsive while a job runs");
    const cancelled = await (await fetch(`${origin}/api/jobs/${queued.id}`, { method: "DELETE", headers })).json();
    assert.ok(["cancelled", "cancelling"].includes(cancelled.status));
    let final = cancelled;
    for (let attempt = 0; attempt < 100 && final.status === "cancelling"; attempt++) {
      await delay(50);
      final = await (await fetch(`${origin}/api/jobs/${queued.id}`, { headers })).json();
    }
    assert.equal(final.status, "cancelled");

    service.kill();
    await once(service, "exit");
    service = launch();
    let restarted = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        restarted = (await fetch(`${origin}/api/health`)).ok;
        if (restarted) break;
      } catch { /* restarting */ }
      await delay(50);
    }
    assert.ok(restarted);
    const nextSession = await (await fetch(`${origin}/api/session`)).json();
    const oldJob = await fetch(`${origin}/api/jobs/${job.id}`, {
      headers: { Authorization: `Bearer ${nextSession.token}` },
    });
    assert.equal(oldJob.status, 404, "service restart does not replay a stale job");
  } finally {
    service.kill();
  }
});
