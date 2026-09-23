/**
 * Workflow vocabulary shared by the editor (client) and the engine (server).
 * A workflow is: when <trigger> happens and <conditions> hold, run <actions>.
 * Nothing in this file touches the database so it can be imported anywhere.
 */

export type TriggerKey =
  | "client.created"
  | "client.stage_changed"
  | "client.activity_logged"
  | "client.follow_up_due"
  | "client.inactive"
  | "property.created"
  | "property.updated"
  | "property.status_changed"
  | "property.linked"
  | "property.link_status_changed"
  | "message.received"
  | "message.sent";

/** What kind of record the trigger is "about". Actions declare which subjects they can work on. */
export type Subject = "client" | "property" | "message" | "link";

export type TriggerDef = {
  key: TriggerKey;
  label: string;
  description: string;
  group: "Clients" | "Properties" | "Messages" | "Time-based";
  /** Records available to conditions and actions when this trigger fires. */
  subjects: Subject[];
  /** Time-based triggers are evaluated on every sync instead of by an event. */
  scheduled?: boolean;
};

export const TRIGGERS: TriggerDef[] = [
  { key: "client.created", label: "A client is added", description: "Fires when a client record is created, including from an inbox conversation.", group: "Clients", subjects: ["client"] },
  { key: "client.stage_changed", label: "A client moves to another stage", description: "Fires when a client's pipeline stage changes, from the board, the client page or a workflow.", group: "Clients", subjects: ["client"] },
  { key: "client.activity_logged", label: "A note, call, meeting or viewing is logged", description: "Fires when you log an activity on a client's timeline.", group: "Clients", subjects: ["client"] },
  { key: "client.follow_up_due", label: "A follow-up becomes due", description: "Fires once for each follow-up date when it passes. Checked every time messages are synced.", group: "Time-based", subjects: ["client"], scheduled: true },
  { key: "client.inactive", label: "A client has gone quiet", description: "Fires once per quiet spell for active clients. Add a condition on \"days since last contact\" to set the threshold.", group: "Time-based", subjects: ["client"], scheduled: true },
  { key: "property.created", label: "A property is added", description: "Fires when a new listing is saved.", group: "Properties", subjects: ["property"] },
  { key: "property.updated", label: "A property is edited", description: "Fires whenever a listing is saved with changes.", group: "Properties", subjects: ["property"] },
  { key: "property.status_changed", label: "A property changes status", description: "Fires when a listing goes under offer, is sold, rented or withdrawn, or comes back to available.", group: "Properties", subjects: ["property"] },
  { key: "property.linked", label: "A property is linked to a client", description: "Fires when a listing is attached to a client record.", group: "Properties", subjects: ["property", "client", "link"] },
  { key: "property.link_status_changed", label: "A client's interest in a property changes", description: "Fires when a linked property moves between suggested, interested, viewing scheduled, viewed, offer made and so on.", group: "Properties", subjects: ["property", "client", "link"] },
  { key: "message.received", label: "A message is received", description: "Fires for every incoming email or WhatsApp message, from clients and unknown contacts.", group: "Messages", subjects: ["message", "client"] },
  { key: "message.sent", label: "You send a message", description: "Fires when you send an email or WhatsApp from Foyer or from Gmail. Automatic replies and workflow messages do not count.", group: "Messages", subjects: ["message", "client"] },
];

export function triggerDef(key: string): TriggerDef | undefined {
  return TRIGGERS.find((t) => t.key === key);
}

export type FieldKind = "text" | "number" | "boolean" | "select";
export type FieldOptions = "stages" | "clientTypes" | "propertyStatuses" | "listingTypes" | "propertyTypes" | "channels" | "linkStatuses" | "activityTypes";

export type FieldDef = {
  key: string;
  label: string;
  kind: FieldKind;
  /** For select fields: a named option set the editor resolves at render time. */
  options?: FieldOptions;
};

const CLIENT_FIELDS: FieldDef[] = [
  { key: "client.is_client", label: "Contact is a known client", kind: "boolean" },
  { key: "client.stage", label: "Client stage", kind: "select", options: "stages" },
  { key: "client.client_type", label: "Client type", kind: "select", options: "clientTypes" },
  { key: "client.source", label: "Client source", kind: "text" },
  { key: "client.budget_min", label: "Client minimum budget", kind: "number" },
  { key: "client.budget_max", label: "Client maximum budget", kind: "number" },
  { key: "client.preferred_areas", label: "Client preferred areas", kind: "text" },
  { key: "client.requirements", label: "Client requirements", kind: "text" },
  { key: "client.notes", label: "Client notes", kind: "text" },
  { key: "client.days_since_contact", label: "Days since last contact", kind: "number" },
  { key: "client.days_in_stage", label: "Days in current stage", kind: "number" },
  { key: "client.has_email", label: "Client has an email address", kind: "boolean" },
  { key: "client.has_phone", label: "Client has a phone number", kind: "boolean" },
];

const PROPERTY_FIELDS: FieldDef[] = [
  { key: "property.status", label: "Property status", kind: "select", options: "propertyStatuses" },
  { key: "property.listing_type", label: "Listing type", kind: "select", options: "listingTypes" },
  { key: "property.property_type", label: "Property type", kind: "select", options: "propertyTypes" },
  { key: "property.price", label: "Price", kind: "number" },
  { key: "property.suburb", label: "Suburb", kind: "text" },
  { key: "property.city", label: "City", kind: "text" },
  { key: "property.bedrooms", label: "Bedrooms", kind: "number" },
  { key: "property.bathrooms", label: "Bathrooms", kind: "number" },
  { key: "property.title", label: "Property title", kind: "text" },
  { key: "property.features", label: "Property features", kind: "text" },
];

const MESSAGE_FIELDS: FieldDef[] = [
  { key: "message.channel", label: "Channel", kind: "select", options: "channels" },
  { key: "message.subject", label: "Subject", kind: "text" },
  { key: "message.body", label: "Message text", kind: "text" },
  { key: "message.is_new_contact", label: "First message from this contact", kind: "boolean" },
  { key: "message.is_automated", label: "Sender looks automated (newsletter, bounce)", kind: "boolean" },
  { key: "message.has_attachments", label: "Has attachments", kind: "boolean" },
  { key: "contact.name", label: "Contact name", kind: "text" },
  { key: "contact.address", label: "Contact email or phone", kind: "text" },
];

const LINK_FIELDS: FieldDef[] = [
  { key: "link.status", label: "Interest status", kind: "select", options: "linkStatuses" },
  { key: "link.previous_status", label: "Previous interest status", kind: "select", options: "linkStatuses" },
];

const EVENT_FIELDS: Record<string, FieldDef[]> = {
  "client.stage_changed": [{ key: "event.previous_stage", label: "Previous stage", kind: "select", options: "stages" }],
  "client.activity_logged": [
    { key: "event.activity_type", label: "Activity type", kind: "select", options: "activityTypes" },
    { key: "event.activity_body", label: "Activity text", kind: "text" },
  ],
  "property.status_changed": [{ key: "event.previous_status", label: "Previous property status", kind: "select", options: "propertyStatuses" }],
};

/** The condition fields that make sense for a trigger, in display order. */
export function fieldsForTrigger(trigger: string): FieldDef[] {
  const def = triggerDef(trigger);
  if (!def) return [];
  const fields: FieldDef[] = [...(EVENT_FIELDS[trigger] ?? [])];
  if (def.subjects.includes("message")) fields.push(...MESSAGE_FIELDS);
  if (def.subjects.includes("property")) fields.push(...PROPERTY_FIELDS);
  if (def.subjects.includes("link")) fields.push(...LINK_FIELDS);
  if (def.subjects.includes("client")) fields.push(...CLIENT_FIELDS);
  return fields;
}

export type OperatorKey = "eq" | "neq" | "contains" | "not_contains" | "gt" | "gte" | "lt" | "lte" | "empty" | "not_empty" | "in";

export const OPERATORS: Array<{ key: OperatorKey; label: string; kinds: FieldKind[]; needsValue: boolean }> = [
  { key: "eq", label: "is", kinds: ["text", "number", "boolean", "select"], needsValue: true },
  { key: "neq", label: "is not", kinds: ["text", "number", "boolean", "select"], needsValue: true },
  { key: "contains", label: "contains", kinds: ["text"], needsValue: true },
  { key: "not_contains", label: "does not contain", kinds: ["text"], needsValue: true },
  { key: "in", label: "is one of", kinds: ["text", "select"], needsValue: true },
  { key: "gt", label: "is more than", kinds: ["number"], needsValue: true },
  { key: "gte", label: "is at least", kinds: ["number"], needsValue: true },
  { key: "lt", label: "is less than", kinds: ["number"], needsValue: true },
  { key: "lte", label: "is at most", kinds: ["number"], needsValue: true },
  { key: "empty", label: "is empty", kinds: ["text", "number", "select"], needsValue: false },
  { key: "not_empty", label: "is not empty", kinds: ["text", "number", "select"], needsValue: false },
];

export type WorkflowCondition = { field: string; op: OperatorKey; value: string };
export type MatchMode = "all" | "any";

export type ActionType = "ai_draft" | "send_template" | "notify" | "log_activity" | "set_follow_up" | "change_stage" | "link_property" | "set_property_status" | "webhook";

export type WorkflowAction = { type: ActionType; config: Record<string, string> };

export type ActionDef = {
  key: ActionType;
  label: string;
  description: string;
  /** The action can run when the trigger provides at least one of these subjects. */
  needs: Subject[];
};

export const ACTIONS: ActionDef[] = [
  {
    key: "ai_draft",
    label: "AI: draft a message",
    description: "Writes a message for you to review on the Drafts page. Nothing is sent until you approve it.",
    needs: ["client", "property", "message"],
  },
  {
    key: "send_template",
    label: "Send a template",
    description: "Sends one of your saved templates to the client or contact immediately. Counts as an automated message.",
    needs: ["client", "message"],
  },
  { key: "notify", label: "Notify me", description: "Adds a notification to the bell in the sidebar.", needs: ["client", "property", "message", "link"] },
  { key: "log_activity", label: "Add a note to the client's timeline", description: "Records a note, call, meeting or viewing on the client.", needs: ["client"] },
  { key: "set_follow_up", label: "Schedule a follow-up", description: "Sets the client's next follow-up a number of days from now.", needs: ["client"] },
  { key: "change_stage", label: "Move the client to a stage", description: "Changes the client's pipeline stage. Fires the stage-changed trigger for other workflows.", needs: ["client"] },
  {
    key: "link_property",
    label: "Link the property to matching clients",
    description: "Finds active clients whose budget, areas and requirements fit the property and links it to them.",
    needs: ["property"],
  },
  { key: "set_property_status", label: "Change the property's status", description: "Marks the property available, under offer, sold, rented or withdrawn.", needs: ["property"] },
  { key: "webhook", label: "Call a webhook", description: "Sends the event as JSON to a URL of your choice, signed with a secret.", needs: ["client", "property", "message", "link"] },
];

export function actionDef(key: string): ActionDef | undefined {
  return ACTIONS.find((a) => a.key === key);
}

/** Actions available for a trigger, based on which subjects it provides. */
export function actionsForTrigger(trigger: string): ActionDef[] {
  const def = triggerDef(trigger);
  if (!def) return [];
  return ACTIONS.filter((action) => action.needs.some((subject) => def.subjects.includes(subject)));
}

/** Who an AI draft or property link is aimed at. */
export const DRAFT_TARGETS: Array<{ key: string; label: string; description: string; needs: Subject[] }> = [
  { key: "event_client", label: "The client in this event", description: "The client (or unknown contact) the trigger is about.", needs: ["client", "message"] },
  { key: "matching_clients", label: "Clients who match the property", description: "Active clients whose budget, preferred areas and requirements fit the property.", needs: ["property"] },
  { key: "linked_clients", label: "Clients already linked to the property", description: "Everyone with this property on their record, except those marked not interested or purchased.", needs: ["property"] },
];

export const CHANNEL_CHOICES = [
  { key: "preferred", label: "Best available (email if they have one, otherwise WhatsApp)" },
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
];

/** Placeholders usable in notification text, notes and subjects. */
export const WORKFLOW_PLACEHOLDERS: Array<{ token: string; description: string }> = [
  { token: "{{client.full_name}}", description: "Client's full name" },
  { token: "{{client.first_name}}", description: "Client's first name" },
  { token: "{{client.stage_label}}", description: "Client's stage" },
  { token: "{{property.title}}", description: "Property title" },
  { token: "{{property.price_formatted}}", description: "Property price with currency" },
  { token: "{{property.suburb}}", description: "Property suburb" },
  { token: "{{message.subject}}", description: "Message subject" },
  { token: "{{message.snippet}}", description: "Start of the message" },
  { token: "{{contact.name}}", description: "Sender or recipient name" },
  { token: "{{event.previous_stage_label}}", description: "Previous stage (stage changes)" },
  { token: "{{matches.count}}", description: "Number of clients matched by an earlier step" },
  { token: "{{agent.name}}", description: "Your name" },
  { token: "{{workflow.name}}", description: "This workflow's name" },
];

export type WorkflowStep = { action: ActionType; status: "done" | "skipped" | "failed"; detail: string };
