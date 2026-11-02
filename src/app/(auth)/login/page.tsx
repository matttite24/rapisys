import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { login } from "../actions";

async function Form({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const { next } = await searchParams;
  return <AuthForm mode="login" action={login} next={typeof next === "string" ? next : undefined} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense>
      <Form searchParams={searchParams} />
    </Suspense>
  );
}
