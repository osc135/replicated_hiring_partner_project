import { useState, useRef, useCallback, type DragEvent } from 'react';
import { Upload } from 'lucide-react';

interface Props {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export default function FileDropZone({ onFileSelected, disabled = false }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndSelect = useCallback((file: File) => {
    setError(null);
    if (!file.name.endsWith('.tar.gz')) {
      setError('Only .tar.gz files are accepted.');
      return;
    }
    onFileSelected(file);
  }, [onFileSelected]);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) validateAndSelect(file);
  }, [disabled, validateAndSelect]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  }, [disabled]);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleClick = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndSelect(file);
    e.target.value = '';
  };

  return (
    <div>
      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed rounded-xl p-16 text-center cursor-pointer transition-all
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${dragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".tar.gz"
          onChange={handleInputChange}
          className="hidden"
        />
        <Upload className={`h-12 w-12 mx-auto mb-4 ${dragOver ? 'text-blue-500' : 'text-gray-400'}`} />
        <p className="text-lg font-medium text-gray-700">
          Drop your <code className="text-sm bg-gray-100 px-1.5 py-0.5 rounded">.tar.gz</code> support bundle here
        </p>
        <p className="mt-2 text-sm text-gray-500">or click to browse</p>
      </div>
      {error && (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}
