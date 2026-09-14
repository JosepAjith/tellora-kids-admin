export async function checkAdminAccess(supabase, userId) {
  if (!supabase || !userId) {
    return false;
  }

  try {
    const { data, error } = await supabase.rpc('is_admin');

    if (!error) {
      return Boolean(data);
    }

    const isMissingFunctionError = typeof error?.message === 'string'
      && /Could not find the function public\.is_admin|function public\.is_admin/i.test(error.message);

    if (!isMissingFunctionError) {
      throw error;
    }

    const { data: adminRows, error: fallbackError } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1);

    if (fallbackError) {
      const isMissingTableError = typeof fallbackError?.message === 'string'
        && /relation "public\.admin_users" does not exist|does not exist/i.test(fallbackError.message);

      if (isMissingTableError) {
        throw new Error(
          'The Supabase admin schema has not been applied. Run the migration in supabase/migrations/0001_initial_schema.sql.',
          { cause: fallbackError }
        );
      }

      throw fallbackError;
    }

    return Boolean(adminRows?.length);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(error.message, { cause: error });
    }

    throw new Error('Unable to verify admin access.', { cause: error });
  }
}
