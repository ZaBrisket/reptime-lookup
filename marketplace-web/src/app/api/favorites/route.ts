import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user || !(session.user as any).id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as any).id;
  const { watchId } = await req.json();

  if (!watchId) {
    return NextResponse.json({ error: "Watch ID is required" }, { status: 400 });
  }

  const existing = await prisma.favorite.findUnique({
    where: { userId_watchId: { userId, watchId } }
  });

  if (existing) {
    await prisma.favorite.delete({
      where: { id: existing.id }
    });
    return NextResponse.json({ status: "removed" });
  } else {
    await prisma.favorite.create({
      data: { userId, watchId }
    });
    return NextResponse.json({ status: "added" });
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session || !session.user || !(session.user as any).id) {
    return NextResponse.json({ favorites: [] });
  }

  const userId = (session.user as any).id;
  
  const favorites = await prisma.favorite.findMany({
    where: { userId },
    select: { watchId: true }
  });

  return NextResponse.json({ favorites: favorites.map(f => f.watchId) });
}
