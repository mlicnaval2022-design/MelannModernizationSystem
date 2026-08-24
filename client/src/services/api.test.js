import { describe, expect, it } from 'vitest';
import { resolveApiBaseURL, shouldRedirectToLogin } from './api';

describe('resolveApiBaseURL', () => {
  it('uses same-origin API path for production builds', () => {
    expect(resolveApiBaseURL()).toBe('/api');
  });

  it('normalizes a trailing slash from an explicit API URL', () => {
    expect(resolveApiBaseURL({ configuredBaseURL: 'https://api.example.com/api/' })).toBe('https://api.example.com/api');
  });

  it('allows an explicit API base URL override', () => {
    expect(resolveApiBaseURL({ configuredBaseURL: 'https://api.example.com/api' })).toBe('https://api.example.com/api');
  });
});

describe('shouldRedirectToLogin', () => {
  it('does not reload an already visible login page after an expected 401', () => {
    expect(shouldRedirectToLogin({ status: 401, currentPath: '/login' })).toBe(false);
  });

  it('redirects an expired authenticated page to login', () => {
    expect(shouldRedirectToLogin({ status: 401, currentPath: '/customers' })).toBe(true);
  });
});
