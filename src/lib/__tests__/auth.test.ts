// @vitest-environment node
import { test, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const cookieStore = new Map<string, { value: string }>();

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => cookieStore.get(name),
    set: (name: string, value: string) => {
      cookieStore.set(name, { value });
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  })),
}));

const {
  createSession,
  getSession,
  deleteSession,
  verifySession,
} = await import("@/lib/auth");

beforeEach(() => {
  cookieStore.clear();
});

function requestWithToken(token?: string) {
  return new NextRequest("http://localhost/api/test", {
    headers: token ? { cookie: `auth-token=${token}` } : undefined,
  });
}

test("createSession sets an httpOnly auth-token cookie", async () => {
  await createSession("user-1", "user@example.com");

  const cookie = cookieStore.get("auth-token");
  expect(cookie).toBeDefined();
  expect(typeof cookie?.value).toBe("string");
});

test("getSession returns null when no cookie is set", async () => {
  const session = await getSession();
  expect(session).toBeNull();
});

test("getSession returns the session payload after createSession", async () => {
  await createSession("user-1", "user@example.com");

  const session = await getSession();
  expect(session).not.toBeNull();
  expect(session?.userId).toBe("user-1");
  expect(session?.email).toBe("user@example.com");
  expect(session?.expiresAt).toBeDefined();
});

test("getSession returns null for a tampered/invalid token", async () => {
  cookieStore.set("auth-token", { value: "not-a-valid-jwt" });

  const session = await getSession();
  expect(session).toBeNull();
});

test("deleteSession removes the auth-token cookie", async () => {
  await createSession("user-1", "user@example.com");
  expect(cookieStore.get("auth-token")).toBeDefined();

  await deleteSession();
  expect(cookieStore.get("auth-token")).toBeUndefined();
});

test("verifySession returns null when request has no cookie", async () => {
  const session = await verifySession(requestWithToken());
  expect(session).toBeNull();
});

test("verifySession returns null for an invalid token", async () => {
  const session = await verifySession(requestWithToken("garbage-token"));
  expect(session).toBeNull();
});

test("verifySession returns the session payload for a valid token", async () => {
  await createSession("user-2", "another@example.com");
  const token = cookieStore.get("auth-token")!.value;

  const session = await verifySession(requestWithToken(token));
  expect(session).not.toBeNull();
  expect(session?.userId).toBe("user-2");
  expect(session?.email).toBe("another@example.com");
});
