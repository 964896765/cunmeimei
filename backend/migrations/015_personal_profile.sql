-- Optional account profile fields; existing users and display names are retained.
ALTER TABLE app_users ADD COLUMN bio varchar(120) NOT NULL DEFAULT '';
ALTER TABLE app_users ADD COLUMN profile_city_code varchar(6) NOT NULL DEFAULT '';
ALTER TABLE app_users ADD COLUMN avatar_image_id uuid REFERENCES content_images(id) ON DELETE RESTRICT;
