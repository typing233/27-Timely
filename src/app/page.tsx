import Link from "next/link";

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-primary-50 to-blue-100">
      <div className="text-center max-w-2xl px-4">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">Timely</h1>
        <p className="text-xl text-gray-600 mb-8">
          Smart scheduling for professionals. Set your availability, share your link, and let others book time with you.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/auth/login" className="btn-primary text-lg px-6 py-3">
            Sign In
          </Link>
          <Link href="/auth/register" className="btn-secondary text-lg px-6 py-3">
            Get Started
          </Link>
        </div>
      </div>
    </div>
  );
}
