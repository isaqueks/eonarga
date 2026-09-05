import { splitMentions } from "@/lib/mentions";

/** Texto puro com as menções `@Nome:` em destaque. Sem link: a galera é pequena, todo mundo sabe quem é. */
export function MentionText({ text }: { text: string }) {
  const parts = splitMentions(text);
  if (parts.length === 1 && !parts[0].mention) return <>{text}</>;
  return (
    <>
      {parts.map((part, index) =>
        part.mention ? (
          <span key={index} className="text-narga font-semibold">
            {part.text}
          </span>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  );
}
