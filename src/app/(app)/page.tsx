import { redirect } from "next/navigation";

/** A casa do app é o feed (docs/08 #36). `/` fica só pra link antigo e pro logo. */
export default function HomePage() {
  redirect("/feed");
}
