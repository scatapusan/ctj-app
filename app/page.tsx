import Link from "next/link"

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="text-center space-y-0 max-w-md w-full flex flex-col items-center">
          {/* CTJ badge */}
          <div className="w-[76px] h-[76px] rounded-full bg-primary border-[2.5px] border-foreground flex items-center justify-center font-black text-2xl tracking-tight text-foreground">
            CTJ
          </div>

          {/* Title */}
          <h1 className="font-black text-4xl text-foreground mt-4 tracking-tight">
            CTJCC Marikina
          </h1>
          <div className="inline-flex mt-3 px-3.5 py-1.5 rounded-full bg-foreground text-background text-xs font-bold tracking-wider uppercase">
            Youth &amp; Young Adults · Marikina
          </div>
          <p className="text-[15px] text-muted-foreground leading-relaxed mt-4 max-w-[290px] text-balance">
            Attendance and events for our youth ministry. Check in when you
            arrive — kita-kits!
          </p>

          {/* Buttons */}
          <div className="flex flex-col gap-3 w-full mt-7">
            <Link
              href="/attend"
              className="flex items-center justify-center w-full min-h-[54px] rounded-full bg-primary border-[2.5px] border-foreground text-foreground font-extrabold text-lg shadow-pop transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
            >
              Check In
            </Link>
            <Link
              href="/attend"
              className="flex items-center justify-center w-full min-h-[54px] rounded-full bg-background border-[2.5px] border-foreground text-foreground font-bold text-lg hover:bg-secondary/60 transition-colors"
            >
              I&apos;m New Here
            </Link>
          </div>

          <Link
            href="/admin/login"
            className="text-sm font-bold text-accent mt-6 underline underline-offset-[3px] hover:text-accent/80"
          >
            Leader sign-in
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-5 px-6 border-t-2 border-foreground">
        <p className="text-xs font-semibold text-muted-foreground leading-relaxed">
          Come To Jesus Community Church of Marikina
        </p>
        <a
          href="/privacy"
          className="text-xs font-semibold text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Privacy Policy
        </a>
      </footer>
    </div>
  )
}
