/**
 * Security rule tests for Storage (fault report photos). They run against the
 * local Firebase emulator (never the live project):  npm run test:rules
 */
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, ref, uploadBytes } from "firebase/storage";

let env: RulesTestEnvironment;

const storage = (uid: string) => env.authenticatedContext(uid).storage();
const anon = () => env.unauthenticatedContext().storage();

const image = (bytes = 1024) => new Uint8Array(bytes);
const jpeg = { contentType: "image/jpeg" };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-dfrmms",
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(), "fault-photos/stu1/existing.jpg"), image(), jpeg);
  });
});

describe("fault photo uploads", () => {
  it("lets a user upload an image into their own folder", async () => {
    await assertSucceeds(uploadBytes(ref(storage("stu1"), "fault-photos/stu1/a.jpg"), image(), jpeg));
    await assertSucceeds(uploadBytes(ref(storage("stu1"), "fault-photos/stu1/b.png"), image(), { contentType: "image/png" }));
    await assertSucceeds(uploadBytes(ref(storage("stu1"), "fault-photos/stu1/c.webp"), image(), { contentType: "image/webp" }));
  });
  it("rejects an upload into another user's folder", async () => {
    await assertFails(uploadBytes(ref(storage("stu1"), "fault-photos/stu2/a.jpg"), image(), jpeg));
  });
  it("rejects files that are not JPG, PNG or WebP images", async () => {
    await assertFails(uploadBytes(ref(storage("stu1"), "fault-photos/stu1/a.pdf"), image(), { contentType: "application/pdf" }));
    await assertFails(uploadBytes(ref(storage("stu1"), "fault-photos/stu1/a.svg"), image(), { contentType: "image/svg+xml" }));
    await assertFails(uploadBytes(ref(storage("stu1"), "fault-photos/stu1/a.html"), image(), { contentType: "text/html" }));
  });
  it("rejects files larger than 5 MB", async () => {
    await assertFails(uploadBytes(ref(storage("stu1"), "fault-photos/stu1/big.jpg"), image(5 * 1024 * 1024 + 1), jpeg));
  });
  it("rejects uploads from visitors who are not signed in", async () => {
    await assertFails(uploadBytes(ref(anon(), "fault-photos/stu1/a.jpg"), image(), jpeg));
  });
});

describe("fault photo access", () => {
  it("lets signed-in users view photos and denies visitors", async () => {
    await assertSucceeds(getBytes(ref(storage("tech1"), "fault-photos/stu1/existing.jpg")));
    await assertFails(getBytes(ref(anon(), "fault-photos/stu1/existing.jpg")));
  });
  it("does not let anyone replace or delete an uploaded photo", async () => {
    await assertFails(uploadBytes(ref(storage("stu1"), "fault-photos/stu1/existing.jpg"), image(), jpeg));
    await assertFails(deleteObject(ref(storage("stu1"), "fault-photos/stu1/existing.jpg")));
  });
  it("keeps every other storage path closed", async () => {
    await assertFails(uploadBytes(ref(storage("stu1"), "other/a.jpg"), image(), jpeg));
    await assertFails(getBytes(ref(storage("stu1"), "other/a.jpg")));
  });
});
