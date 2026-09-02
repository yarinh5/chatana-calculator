CREATE TABLE public.guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  group_size integer NOT NULL DEFAULT 1,
  phone text,
  email text,
  notes text,
  side text CHECK (side IN ('חתן','כלה','משותף')),
  arrived boolean,
  arrived_count integer,
  gift_amount numeric NOT NULL DEFAULT 0,
  payment_method text CHECK (payment_method IN ('מזומן','העברה','צ''ק','אפליקציה','לא ידוע')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.guests TO authenticated;
GRANT ALL ON public.guests TO service_role;

ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY guests_owner_all ON public.guests
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = guests.event_id AND (e.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = guests.event_id AND (e.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

CREATE INDEX guests_event_id_idx ON public.guests(event_id);

CREATE TRIGGER update_guests_updated_at
BEFORE UPDATE ON public.guests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.guests REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.guests;