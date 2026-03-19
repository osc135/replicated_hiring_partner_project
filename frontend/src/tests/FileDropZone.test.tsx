import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FileDropZone from '../components/FileDropZone';

describe('FileDropZone', () => {
  it('renders drop zone with instructions', () => {
    render(<FileDropZone onFileSelected={vi.fn()} />);
    expect(screen.getByText(/support bundle here/i)).toBeInTheDocument();
    expect(screen.getByText(/click to browse/i)).toBeInTheDocument();
  });

  it('accepts .tar.gz files', () => {
    const onFileSelected = vi.fn();
    render(<FileDropZone onFileSelected={onFileSelected} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['bundle-data'], 'support-bundle.tar.gz', { type: 'application/gzip' });

    fireEvent.change(input, { target: { files: [file] } });
    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('rejects non .tar.gz files and shows error', () => {
    const onFileSelected = vi.fn();
    render(<FileDropZone onFileSelected={onFileSelected} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['data'], 'readme.txt', { type: 'text/plain' });

    fireEvent.change(input, { target: { files: [file] } });
    expect(onFileSelected).not.toHaveBeenCalled();
    expect(screen.getByText(/only .tar.gz files are accepted/i)).toBeInTheDocument();
  });

  it('disables interaction when disabled prop is true', () => {
    render(<FileDropZone onFileSelected={vi.fn()} disabled />);
    const dropZone = screen.getByText(/support bundle here/i).closest('div[class*="border-dashed"]');
    expect(dropZone?.className).toContain('opacity-50');
  });
});
