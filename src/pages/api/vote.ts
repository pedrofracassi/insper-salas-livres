// Next.js API route support: https://nextjs.org/docs/api-routes/introduction
import axios from "axios";
import type { NextApiRequest, NextApiResponse } from "next";
import { parseStringPromise } from "xml2js";
import { CalendarioEvento, RootAlocacao, SalasResponse } from "../../types";
import hash from 'object-hash'
import { kv } from "@vercel/kv";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (req.method === 'POST') {
    const body: {
      hash: string,
      user_id: string,
      vote: "UP" | "DOWN"
    } = req.body;

    if (!body.hash || !body.user_id || !body.vote) {
      res.status(400).json({ error: "Missing parameters" });
      return;
    }

    if (body.vote !== "UP" && body.vote !== "DOWN") {
      res.status(400).json({ error: "Invalid vote" });
      return;
    }

    await kv.multi()
      .expire(`votes:${body.hash}:${body.vote}`, 60 * 60 * 12)
      .sadd(`votes:${body.hash}:${body.vote}`, body.user_id)
      .srem(`votes:${body.hash}:${body.vote === "UP" ? "DOWN" : "UP"}`, body.user_id)
      .exec()

    const membersUp = await kv.smembers(`votes:${body.hash}:UP`)
    const membersDown = await kv.smembers(`votes:${body.hash}:DOWN`)

    res.status(200).json({ score: membersUp.length - membersDown.length });
  }
}
