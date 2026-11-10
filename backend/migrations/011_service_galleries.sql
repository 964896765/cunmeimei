ALTER TABLE service_catalog ADD COLUMN image_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE service_catalog ADD CONSTRAINT service_gallery_size CHECK(cardinality(image_ids)<=6 AND array_position(image_ids,NULL) IS NULL);
CREATE INDEX service_gallery_images ON service_catalog USING gin(image_ids);
