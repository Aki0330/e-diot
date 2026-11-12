CREATE TABLE "proactive_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(64) NOT NULL,
	"local_date" date NOT NULL,
	"kind" varchar(20) NOT NULL,
	"session_id" varchar(64),
	"message_id" integer,
	"status" varchar(10) DEFAULT 'sent' NOT NULL,
	"payload" jsonb,
	"feedback" varchar(20),
	"feedback_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "is_proactive" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "proactive_events" ADD CONSTRAINT "proactive_events_user_id_users_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proactive_events" ADD CONSTRAINT "proactive_events_session_id_chat_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("session_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_proactive_user_date_kind" ON "proactive_events" USING btree ("user_id","local_date","kind");--> statement-breakpoint
CREATE INDEX "idx_proactive_user_date" ON "proactive_events" USING btree ("user_id","local_date");