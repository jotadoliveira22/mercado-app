import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://sjhvwraukqaebewytmln.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaHZ3cmF1a3FhZWJld3l0bWxuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MDkxMDksImV4cCI6MjA5NzM4NTEwOX0.kEYjPlnlOoNy70GmRaJic7-FhMxuCb3jFidx1aKebhU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export function getDeviceId(): string {
  let id = localStorage.getItem('device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('device_id', id);
  }
  return id;
}
