import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import StreamingMarkdown from '../components/StreamingMarkdown';

describe('StreamingMarkdown', () => {
  it('renders markdown headings and paragraphs', () => {
    const content = '## Summary\n\nThe cluster has critical issues.';
    render(<StreamingMarkdown content={content} />);
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('The cluster has critical issues.')).toBeInTheDocument();
  });

  it('strips SEVERITY prefix from content', () => {
    const content = 'SEVERITY: critical\n\n## Summary\n\nPod is crashing.';
    render(<StreamingMarkdown content={content} />);
    expect(screen.queryByText(/SEVERITY:/)).not.toBeInTheDocument();
    expect(screen.getByText('Summary')).toBeInTheDocument();
    expect(screen.getByText('Pod is crashing.')).toBeInTheDocument();
  });

  it('shows streaming cursor when streaming is true', () => {
    const { container } = render(<StreamingMarkdown content="Loading..." streaming />);
    const cursor = container.querySelector('.animate-pulse');
    expect(cursor).toBeInTheDocument();
  });

  it('hides streaming cursor when streaming is false', () => {
    const { container } = render(<StreamingMarkdown content="Done." streaming={false} />);
    const cursor = container.querySelector('.animate-pulse');
    expect(cursor).not.toBeInTheDocument();
  });

  it('renders inline code correctly', () => {
    const content = 'Run `kubectl get pods` to check status.';
    render(<StreamingMarkdown content={content} />);
    expect(screen.getByText('kubectl get pods')).toBeInTheDocument();
  });

  it('renders confidence badges for High/Medium/Low', () => {
    const content = '**Confidence**: High';
    render(<StreamingMarkdown content={content} />);
    expect(screen.getByText('High')).toBeInTheDocument();
  });
});
