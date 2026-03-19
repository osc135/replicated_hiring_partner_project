import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SeverityBanner from '../components/SeverityBanner';

describe('SeverityBanner', () => {
  it('renders critical severity with correct label and description', () => {
    render(<SeverityBanner severity="critical" />);
    expect(screen.getByText('CRITICAL')).toBeInTheDocument();
    expect(screen.getByText(/immediate attention required/i)).toBeInTheDocument();
  });

  it('renders warning severity', () => {
    render(<SeverityBanner severity="warning" />);
    expect(screen.getByText('WARNING')).toBeInTheDocument();
    expect(screen.getByText(/review recommended/i)).toBeInTheDocument();
  });

  it('renders info severity', () => {
    render(<SeverityBanner severity="info" />);
    expect(screen.getByText('INFO')).toBeInTheDocument();
    expect(screen.getByText(/no critical issues/i)).toBeInTheDocument();
  });
});
