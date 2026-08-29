import { describe, expect, it } from "vitest";
import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";

describe("Express 5 async error handling", () => {
  it("forwards a rejected async route handler to the error middleware instead of crashing the process", async () => {
    const app = express();

    app.get("/boom", async () => {
      throw new Error("simulated async failure");
    });

    app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
      res.status(500).json({ code: "INTERNAL_ERROR", caught: true });
    });

    const response = await request(app).get("/boom");

    expect(response.status).toBe(500);
    expect(response.body.caught).toBe(true);
  });
});
