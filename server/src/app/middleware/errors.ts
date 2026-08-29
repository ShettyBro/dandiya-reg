import type { Request, Response } from "express";

export interface ErrorEnvelope {
  code: string;
  message: string;
  details: unknown;
  requestId: string | null;
}

export function sendError(
  req: Request,
  res: Response,
  status: number,
  code: string,
  message: string,
  details: unknown = null
): void {
  const envelope: ErrorEnvelope = {
    code,
    message,
    details,
    requestId: req.id !== undefined ? String(req.id) : null
  };
  res.status(status).json(envelope);
}
