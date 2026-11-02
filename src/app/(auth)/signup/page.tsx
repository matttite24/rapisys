import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { signup } from "../actions";

async function Form({ searchParams }: { searchParams: PageProps<"/signup">["searchParams"] }) {
  const { next } = await searchParams;
  return <AuthForm mode="signup" action={signup} next={typeof next === "string" ? next : undefined} />;
}

export default function SignupPage({ searchParams }: PageProps<"/signup">) {
  return (
    <Suspense>
      <Form searchParams={searchParams} />
    </Suspense>
  );
}
