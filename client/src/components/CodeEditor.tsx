import EditorModule from "react-simple-code-editor";
import { highlight } from "../lib/highlight";

// The package is CommonJS. Some bundlers wrap its default export one level deep.
const Editor = ((EditorModule as unknown as { default?: typeof EditorModule }).default ?? EditorModule) as typeof EditorModule;

interface Props {
  value: string;
  language: string;
  onChange: (code: string) => void;
  placeholder?: string;
}

export function CodeEditor({ value, language, onChange, placeholder }: Props) {
  return (
    <div className="code-editor">
      <Editor
        value={value}
        onValueChange={onChange}
        highlight={(code) => highlight(code, language)}
        padding={12}
        tabSize={4}
        insertSpaces
        placeholder={placeholder}
        textareaClassName="code-editor-textarea"
        preClassName="hljs"
        spellCheck={false}
      />
    </div>
  );
}
