"use client";

import { Spinner } from "@heroui/spinner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { GoogleColouredIcon } from "@/components/Misc/icons";
import { Button } from "@/components/ui/button";
import { useUser } from "@/hooks/useUser";

import { FlickeringGrid } from "../MagicUI/flickering-grid";
import { handleAuthButtonClick } from "./authHelpers";

export default function Signup() {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const user = useUser();

  useEffect(() => {
    if (user?.email) router.push("/c");
  }, [user, router]);

  return (
    <form className="flex h-screen w-screen flex-row items-center justify-center gap-10 overflow-auto select-none">
      <div className="backdrop-blur- shadow-blue-30 relative z-1 flex w-full max-w-(--breakpoint-sm) flex-col items-center justify-center gap-5 rounded-4xl bg-black/10 p-10 shadow-2xl shadow-black backdrop-blur-[3px]">
        <div className="mb-3 space-y-2 text-center">
          <div className="text-5xl font-medium">Create an Account</div>
          <div className="text-lg text-foreground-600">
            Sign up to experience a smarter, more organized life
          </div>
        </div>
        <Button
          className={`text-md gap-2 rounded-full px-4 ${
            loading ? "bg-zinc-800 text-primary hover:bg-zinc-800" : "bg-white"
          }`}
          size="lg"
          type="button"
          disabled={loading}
          onClick={() => handleAuthButtonClick(setLoading)}
        >
          {loading ? (
            <>
              <Spinner size="sm" />
              <span>Loading ...</span>
            </>
          ) : (
            <>
              <GoogleColouredIcon />
              <span>Sign up with Google</span>
            </>
          )}
        </Button>
        <Link href="/login">
          <Button
            className="text-md gap-2 rounded-full px-4 font-normal text-primary"
            size="lg"
            type="button"
            variant="link"
          >
            Already a user? Login here
          </Button>
        </Link>
      </div>
      <div>
        <FlickeringGrid
          className="absolute inset-0 z-0 size-full [mask-image:linear-gradient(to_bottom,rgba(0,0,0,0),rgba(0,0,0,1))] [mask-size:100%_100%] [mask-repeat:no-repeat]"
          squareSize={4}
          gridGap={8}
          color="#00bbff"
          maxOpacity={0.8}
          flickerChance={0.7}
        />
      </div>
    </form>
  );
}
