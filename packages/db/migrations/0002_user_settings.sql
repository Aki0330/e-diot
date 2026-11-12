CREATE TABLE "user_settings" (
	"user_id" varchar(64) PRIMARY KEY NOT NULL,
	"persona" varchar(20) DEFAULT 'buddy' NOT NULL,
	"proactive_level" varchar(20) DEFAULT 'medium' NOT NULL,
	"care_time" varchar(5) DEFAULT '17:45' NOT NULL,
	"quiet_start" varchar(5) DEFAULT '22:00' NOT NULL,
	"quiet_end" varchar(5) DEFAULT '08:00' NOT NULL,
	"snooze_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;