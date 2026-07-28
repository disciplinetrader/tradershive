
CREATE OR REPLACE FUNCTION public.trg_admin_audit_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.action ILIKE '%delete%' OR NEW.action ILIKE '%ban%' OR NEW.action ILIKE '%role%' THEN
    INSERT INTO public.admin_notifications(kind, severity, title, message, metadata, source)
    VALUES (
      'audit_event',
      CASE WHEN NEW.action ILIKE '%delete%' OR NEW.action ILIKE '%ban%' THEN 'warning' ELSE 'info' END,
      'Admin action: ' || NEW.action,
      COALESCE(NEW.resource, '') || ' ' || COALESCE(NEW.resource_id::text, ''),
      COALESCE(NEW.meta, '{}'::jsonb),
      'admin_audit_logs'
    );
  END IF;
  RETURN NEW;
END $$;
