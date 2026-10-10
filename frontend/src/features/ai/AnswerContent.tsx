import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./AiChat.module.css";

export function AnswerContent({
  content,
  onNavigate,
}: {
  content: string;
  onNavigate: () => void;
}) {
  return (
    <div className={styles.markdown}>
      <Markdown
        skipHtml
        disallowedElements={["img"]}
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const internal = href?.startsWith("/@");

            return (
              <a
                href={href}
                target={internal ? undefined : "_blank"}
                rel="noopener noreferrer"
                onClick={internal ? onNavigate : undefined}
              >
                {children}
              </a>
            );
          },
          table: ({ children }) => (
            <div className={styles.tableWrap}>
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
