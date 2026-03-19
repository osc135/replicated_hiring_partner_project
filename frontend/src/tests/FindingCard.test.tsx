import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FindingCard from '../components/FindingCard';

describe('FindingCard', () => {
  const baseFinding = {
    rule: 'CrashLoopBackOff',
    severity: 'critical',
    message: 'Pod is crash looping',
  };

  it('renders finding rule name, severity, and message', () => {
    render(<FindingCard {...baseFinding} />);
    expect(screen.getByText('CrashLoopBackOff')).toBeInTheDocument();
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText('Pod is crash looping')).toBeInTheDocument();
  });

  it('expands to show evidence when matches are provided', () => {
    const matches = [
      { line_number: 42, line: 'Back-off restarting failed container' },
    ];
    render(<FindingCard {...baseFinding} file_path="pods/nginx.json" matches={matches} />);

    // Evidence should be hidden initially
    expect(screen.queryByText('Evidence:')).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByText('CrashLoopBackOff'));
    expect(screen.getByText('Evidence:')).toBeInTheDocument();
    expect(screen.getByText('Back-off restarting failed container')).toBeInTheDocument();
    expect(screen.getByText('pods/nginx.json')).toBeInTheDocument();
  });

  it('renders warning and info severities correctly', () => {
    const { rerender } = render(
      <FindingCard rule="Unhealthy" severity="warning" message="Readiness probe failed" />
    );
    expect(screen.getByText('WARNING')).toBeInTheDocument();

    rerender(
      <FindingCard rule="HTTPServerError" severity="info" message="500 responses detected" />
    );
    expect(screen.getByText('INFO')).toBeInTheDocument();
  });
});
