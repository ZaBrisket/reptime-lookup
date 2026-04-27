import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { watchId, dealerId, url } = await req.json();

    if (!watchId || !dealerId || !url) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Upsert the deep link (only one per watch/dealer combo)
    const deepLink = await prisma.deepLink.upsert({
      where: {
        watchId_dealerId: {
          watchId,
          dealerId,
        },
      },
      update: {
        url,
        userId: user.id, // Track who updated it last
      },
      create: {
        watchId,
        dealerId,
        url,
        userId: user.id,
      },
    });

    return NextResponse.json({ success: true, deepLink });
  } catch (error) {
    console.error("Deep link error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
