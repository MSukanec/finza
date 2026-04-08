-- ==============================================================================
-- 009: Category Groups Normalization & Debts Module
-- ==============================================================================

BEGIN;

-- 1. Create category_groups table
CREATE TABLE IF NOT EXISTS public.category_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE, -- NULL means System Group
    name TEXT NOT NULL,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.category_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own and system groups" ON public.category_groups
    FOR SELECT TO public
    USING (user_id IS NULL OR user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "Users insert own groups" ON public.category_groups
    FOR INSERT TO public
    WITH CHECK (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "Users update own groups" ON public.category_groups
    FOR UPDATE TO public
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));

CREATE POLICY "Users delete own groups" ON public.category_groups
    FOR DELETE TO public
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()) AND NOT is_system);


-- 2. Create Debts table (Domain Extended)
CREATE TABLE IF NOT EXISTS public.debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    total_amount NUMERIC(15, 2) NOT NULL,
    currency_code TEXT NOT NULL DEFAULT 'ARS',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own debts" ON public.debts
    FOR ALL TO public
    USING (user_id = (SELECT id FROM public.users WHERE auth_id = auth.uid()));
    
CREATE TRIGGER set_updated_at_debts
    BEFORE UPDATE ON public.debts
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- 3. Alter categories table to add group_id
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.category_groups(id) ON DELETE RESTRICT;

-- 4. Data Migration
DO $$
DECLARE
    sys_deudas_id UUID;
    sys_general_id UUID;
BEGIN
    -- Only migrate if we haven't done it yet (check if category_groups is empty)
    IF NOT EXISTS (SELECT 1 FROM public.category_groups) THEN
        
        -- A. Create System Groups
        INSERT INTO public.category_groups (name, is_system) VALUES ('Deudas', true) RETURNING id INTO sys_deudas_id;
        INSERT INTO public.category_groups (name, is_system) VALUES ('General', true) RETURNING id INTO sys_general_id;

        -- B. Create User Groups based on existing data
        INSERT INTO public.category_groups (user_id, name, is_system)
        SELECT DISTINCT user_id, group_name, false
        FROM public.categories
        WHERE group_name NOT IN ('Deudas', 'Deuda', 'DEUDAS', 'General', 'general', 'GENERAL')
        AND group_name IS NOT NULL;

        -- C. Update Categories with their new FK mappings
        -- Map Deudas
        UPDATE public.categories SET group_id = sys_deudas_id 
        WHERE group_name IN ('Deudas', 'Deuda', 'DEUDAS');

        -- Map General
        UPDATE public.categories SET group_id = sys_general_id 
        WHERE group_name IN ('General', 'general', 'GENERAL') OR group_name IS NULL;

        -- Map User specifics
        UPDATE public.categories c
        SET group_id = cg.id
        FROM public.category_groups cg
        WHERE cg.user_id = c.user_id AND cg.name = c.group_name AND c.group_id IS NULL;
        
        -- D. Force any remaining nulls to General
        UPDATE public.categories SET group_id = sys_general_id WHERE group_id IS NULL;
        
    END IF;
END $$;

-- 5. Make group_id NOT NULL and Drop old group_name text column
-- Wait, we will ONLY drop group_name after we migrate the frontend so the frontend doesn't break right now.
-- We will keep group_name for now as a fallback, but make group_id NOT NULL.
ALTER TABLE public.categories ALTER COLUMN group_id SET NOT NULL;

COMMIT;
