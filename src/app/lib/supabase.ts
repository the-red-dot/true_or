import { createClient } from '@supabase/supabase-js';

// שליפת ההגדרות ממשתני הסביבה (עם סימן קריאה כדי להגיד ל-TS שזה קיים בטוח)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);