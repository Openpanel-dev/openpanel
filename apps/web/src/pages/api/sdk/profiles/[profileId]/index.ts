import { validateSdkRequest } from "@/server/auth";
import { db } from "@/server/db";
import { createError, handleError } from "@/server/exceptions";
import { getProfile } from "@/services/profile.service";
import { type ProfilePayload } from "@mixan/types";
import type { NextApiRequest, NextApiResponse } from "next";

interface Request extends NextApiRequest {
  body: ProfilePayload;
}

export default async function handler(req: Request, res: NextApiResponse) { 
  if (req.method !== "PUT" && req.method !== "POST") {
    return handleError(res, createError(405, "Method not allowed"));
  }

  try {
    // Check client id & secret
    await validateSdkRequest(req)

    const profileId = req.query.profileId as string;
    const profile = await getProfile(profileId)
    
    const { body } = req;
    await db.profile.update({
      where: {
        id: profileId,
      },
      data: {
        external_id: body.id,
        email: body.email,
        first_name: body.first_name,
        last_name: body.last_name,
        avatar: body.avatar,
        properties: {
          ...(typeof profile.properties === "object"
            ? profile.properties ?? {}
            : {}),
          ...(body.properties ?? {}),
        },
      },
    });

    res.status(200).end();
  } catch (error) {
    handleError(res, error);
  }
}
