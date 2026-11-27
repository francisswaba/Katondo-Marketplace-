-- Staff numbers become random codes with a check character, e.g. S-7QM4-R9K,
-- instead of counting up (S-0001, S-0002, ...). Counting numbers reveal how many
-- staff there are and are easy to guess when impersonating staff.
-- Must match staffNumberAlphabet / staffNumberCheckCharacter in packages/contracts.

CREATE OR REPLACE FUNCTION katondo_staff_check_char(body TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  alphabet CONSTANT TEXT := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  n CONSTANT INT := 30;
  factor INT := 2;
  total INT := 0;
  addend INT;
  i INT;
BEGIN
  FOR i IN REVERSE length(body)..1 LOOP
    addend := factor * (strpos(alphabet, substr(body, i, 1)) - 1);
    factor := CASE WHEN factor = 2 THEN 1 ELSE 2 END;
    total := total + (addend / n) + (addend % n);
  END LOOP;
  RETURN substr(alphabet, ((n - (total % n)) % n) + 1, 1);
END $$;

CREATE OR REPLACE FUNCTION katondo_new_staff_number() RETURNS TEXT
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
  alphabet CONSTANT TEXT := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  body TEXT;
  random_bytes BYTEA;
  value INT;
  i INT;
  candidate TEXT;
BEGIN
  LOOP
    body := '';
    WHILE length(body) < 6 LOOP
      -- gen_random_uuid uses the server's secure random source; bytes 6 and 8 hold
      -- fixed version bits, so skip them, and drop values >= 240 to avoid bias.
      random_bytes := uuid_send(gen_random_uuid());
      FOR i IN 0..15 LOOP
        CONTINUE WHEN i IN (6, 8);
        value := get_byte(random_bytes, i);
        IF value < 240 AND length(body) < 6 THEN
          body := body || substr(alphabet, (value % 30) + 1, 1);
        END IF;
      END LOOP;
    END LOOP;
    candidate := 'S-' || substr(body, 1, 4) || '-' || substr(body, 5, 2) || katondo_staff_check_char(body);
    EXIT WHEN NOT EXISTS (SELECT 1 FROM staff_members WHERE staff_number = candidate);
  END LOOP;
  RETURN candidate;
END $$;

ALTER TABLE staff_members ALTER COLUMN staff_number SET DEFAULT katondo_new_staff_number();

-- Replace any counting numbers given out by migration 012. Sign-in is not live yet,
-- so no customer has seen them.
UPDATE staff_members SET staff_number = katondo_new_staff_number() WHERE staff_number ~ '^S-[0-9]+$';

DROP SEQUENCE IF EXISTS staff_number_seq;

ALTER TABLE staff_members DROP CONSTRAINT IF EXISTS staff_members_staff_number_format;
ALTER TABLE staff_members ADD CONSTRAINT staff_members_staff_number_format
  CHECK (staff_number ~ '^S-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{3}$');
