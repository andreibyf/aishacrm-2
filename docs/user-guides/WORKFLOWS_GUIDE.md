# Workflows - User Guide

Workflows let you automate your CRM with custom, trigger-based automations — so routine work happens without manual effort.

## Creating a workflow

1. On the Workflows page, click **Create Workflow** (or **Create Your First Workflow** if you don't have any yet).
2. The **Workflow Builder** opens in a dialog where you configure the workflow's **triggers, conditions, and actions**.
3. Save your changes in the builder. The new workflow then appears in your list.

## Understanding the workflow list

Each workflow is shown as a card with:

- Its **name** and an **Active** or **Inactive** badge.
- A **description** (or "No description" if none was set).
- The **trigger type** (for example, _webhook_).
- An **executions** count and the **Last run** time, when available.
- The **Workflow ID** and, for webhook workflows, a **Webhook URL** you can copy.

## Managing a workflow

1. **Activate / deactivate** — click the play/pause button on the card to turn a workflow on or off. You'll see a "Workflow activated" or "Workflow deactivated" confirmation.
2. **Edit** — click the edit (pencil) button to reopen the Workflow Builder and change the triggers, conditions, or actions.
3. **Delete** — click the delete (trash) button, then confirm "Delete workflow?" in the prompt. A "Workflow deleted" confirmation appears.

## Tips

- Deactivate a workflow instead of deleting it if you only need to pause it temporarily.
- Use the **Webhook URL** shown on a webhook workflow's card to trigger it from an external system.
- Workflows run within your current tenant context, so make sure the right tenant is selected.
