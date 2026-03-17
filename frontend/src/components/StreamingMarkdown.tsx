import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
  streaming?: boolean;
}

export default function StreamingMarkdown({ content, streaming = false }: Props) {
  return (
    <div className="prose prose-slate max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-strong:text-gray-900 prose-code:text-gray-800 prose-code:bg-gray-100 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none prose-pre:bg-gray-900 prose-pre:text-gray-100">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
      {streaming && (
        <span className="inline-block w-2 h-5 bg-blue-500 animate-pulse rounded-sm ml-0.5 align-text-bottom" />
      )}
    </div>
  );
}
