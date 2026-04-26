ALTER TABLE roleplay_assignment
DROP CONSTRAINT IF EXISTS roleplay_assignment_roleplay_id_fkey;

ALTER TABLE roleplay_assignment
ADD CONSTRAINT roleplay_assignment_roleplay_id_fkey
FOREIGN KEY (roleplay_id)
REFERENCES roleplays(id);
