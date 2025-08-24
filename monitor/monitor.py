from datetime import datetime
import os

import aiohttp

from textual.app import App, ComposeResult
from textual.widgets import (
    Header,
    Footer,
    DataTable,
    Label,
    Rule,
    Sparkline,
    Static,
    Switch,
    TabbedContent,
    TabPane,
)
from textual.containers import Vertical, Horizontal
from textual.reactive import reactive
from rich.text import Text


PYCHESS_MONITOR_TOKEN = os.getenv("PYCHESS_MONITOR_TOKEN", "")
URL = "http://localhost:8080/metrics"


class MemoryMonitorApp(App):
    """Textual TUI app to monitor aiohttp server memory usage and object usage."""

    CSS_PATH = "monitor.css"

    monitoring = reactive(True)  # switch on/off

    # Reactive variables for updating UI
    conn_count = reactive(0)
    user_count = reactive(0)
    game_count = reactive(0)
    task_count = reactive(0)
    queue_count = reactive(0)

    conn_memory_size = reactive(0.0)
    user_memory_size = reactive(0.0)
    game_memory_size = reactive(0.0)
    task_memory_size = reactive(0.0)
    queue_memory_size = reactive(0.0)

    top_allocations = reactive([])
    object_details = reactive(
        {"users": [], "games": [], "tasks": [], "queues": [], "connections": []}
    )

    # Historical data for sparklines
    conn_count_history = reactive([])
    user_count_history = reactive([])
    game_count_history = reactive([])
    task_count_history = reactive([])
    queue_count_history = reactive([])

    # Sorting states per category
    sort_columns = reactive(
        {
            "users": None,
            "games": None,
            "tasks": None,
            "queues": None,
            "connections": None,
        }
    )
    sort_ascendings = reactive(
        {
            "users": True,
            "games": True,
            "tasks": True,
            "queues": True,
            "connections": True,
        }
    )

    def __init__(self):
        super().__init__()
        self.update_interval = 5
        self.max_history = 100
        self.categories = ["users", "games", "tasks", "queues", "connections"]

    def compose(self) -> ComposeResult:
        """Compose the TUI layout."""
        yield Header()
        with Horizontal():
            with Vertical(id="left_panel"):
                yield Horizontal(
                    Static("Monitoring:", classes="label"),
                    Switch(value=True, id="monitoring"),
                    classes="container",
                )
                yield Rule()
                yield Label(f"Tasks: {self.task_count}", id="tasks_label")
                yield Label(
                    "Tasks Mem: [b]{:.2f} KB[/b]".format(self.task_memory_size),
                    id="tasks_mem_label",
                )
                yield Sparkline([], id="tasks_sparkline")
                yield Label(f"Queues: {self.queue_count}", id="queues_label")
                yield Label(
                    "Queues Mem: [b]{:.2f} KB[/b]".format(self.queue_memory_size),
                    id="queues_mem_label",
                )
                yield Sparkline([], id="queues_sparkline")
                yield Label(f"Users: {self.user_count}", id="users_label")
                yield Label(
                    "Users Mem: [b]{:.2f} KB[/b]".format(self.user_memory_size),
                    id="users_mem_label",
                )
                yield Sparkline([], id="users_sparkline")
                yield Label(f"Games: {self.game_count}", id="games_label")
                yield Label(
                    "Games Mem: [b]{:.2f} KB[/b]".format(self.game_memory_size),
                    id="games_mem_label",
                )
                yield Sparkline([], id="games_sparkline")
                yield Label(f"Connections: {self.conn_count}", id="conn_label")
                yield Label(
                    "Conn Mem: [b]{:.2f} KB[/b]".format(self.conn_memory_size), id="conn_mem_label"
                )
                yield Sparkline([], id="conn_sparkline")
            with Vertical(id="right_panel"):
                yield DataTable(id="alloc_table")
                with TabbedContent(id="details_tabs"):
                    for category in self.categories:
                        with TabPane(category.capitalize(), id=f"{category}_tab"):
                            yield DataTable(id=f"{category}_table")
        yield Footer()

    async def on_mount(self) -> None:
        """Set up the app on startup."""
        self.query_one("#left_panel").border_title = "App State"
        self.query_one("#alloc_table").border_title = "Alloc Table"
        self.query_one("#details_tabs").border_title = "Object Details"

        # Configure the allocation table
        alloc_table = self.query_one("#alloc_table", DataTable)
        alloc_table.add_columns("Type", "Count", "Size (bytes)", "Size (human)")
        alloc_table.zebra_stripes = True

        # Column configurations
        column_configs = {
            "users": [
                ("Title", "title"),
                ("Username", "username"),
                ("Online", "online"),
                ("Last Seen", "last_seen"),
            ],
            "games": [
                ("Game ID", "id"),
                ("Status", "status"),
                ("Players", "players"),
                ("Date", "date"),
            ],
            "tasks": [
                ("Task ID", "id"),
                ("Name", "name"),
                ("State", "state"),
                ("File", "file"),
                ("Source", "source"),
            ],
            "queues": [
                ("Queue ID", "id"),
                ("Name", "name"),
                ("Size", "size"),
                ("File", "file"),
                ("Source", "source"),
            ],
            "connections": [("Conn ID", "id"), ("Timestamp", "timestamp")],
        }

        for category in self.categories:
            table = self.query_one(f"#{category}_table", DataTable)
            config = column_configs[category]
            for label, _ in config:
                table.add_column(label, key=label)
            table.zebra_stripes = True
            table.cursor_type = "row"
            table.show_header = True
            table.show_cursor = True
            table.fixed_rows = 0

        # Start periodic updates
        self.set_interval(self.update_interval, self.update_metrics)

    async def update_metrics(self) -> None:
        """Fetch server metrics and update UI."""
        if not self.monitoring:
            return

        async with aiohttp.ClientSession() as session:
            try:
                headers = {"Authorization": "Bearer %s" % PYCHESS_MONITOR_TOKEN}
                async with session.get(URL, headers=headers) as response:
                    if response.status == 200:
                        data = await response.json()

                        self.conn_count = data.get("object_counts", {}).get("connections", 0)
                        self.user_count = data.get("object_counts", {}).get("users", 0)
                        self.game_count = data.get("object_counts", {}).get("games", 0)
                        self.task_count = data.get("object_counts", {}).get("tasks", 0)
                        self.queue_count = data.get("object_counts", {}).get("queues", 0)

                        self.user_memory_size = data.get("object_sizes", {}).get("users", 0.0)
                        self.game_memory_size = data.get("object_sizes", {}).get("games", 0.0)
                        self.task_memory_size = data.get("object_sizes", {}).get("tasks", 0.0)
                        self.conn_memory_size = data.get("object_sizes", {}).get("connections", 0.0)
                        self.queue_memory_size = data.get("object_sizes", {}).get("queues", 0.0)

                        self.top_allocations = [
                            (
                                alloc["type"],
                                alloc["count"],
                                alloc["size_bytes"],
                                alloc["size_human"],
                            )
                            for alloc in data.get("top_allocations", [])
                        ]
                        self.object_details = data.get(
                            "object_details",
                            {"users": [], "games": [], "tasks": [], "queues": [], "connections": []},
                        )

                        # Update historical data
                        self.user_count_history = self.user_count_history + [self.user_count]
                        self.game_count_history = self.game_count_history + [self.game_count]
                        self.task_count_history = self.task_count_history + [self.task_count]
                        self.conn_count_history = self.conn_count_history + [self.conn_count]
                        self.queue_count_history = self.queue_count_history + [self.queue_count]

                        # Trim history to max length
                        self.user_count_history = self.user_count_history[-self.max_history :]
                        self.game_count_history = self.game_count_history[-self.max_history :]
                        self.task_count_history = self.task_count_history[-self.max_history :]
                        self.conn_count_history = self.conn_count_history[-self.max_history :]
                        self.queue_count_history = self.queue_count_history[-self.max_history :]
                    else:
                        self.conn_count = -1
            except aiohttp.ClientError:
                self.conn_count = -1

        # Update UI
        self.refresh_ui()

    def refresh_ui(self) -> None:
        """Update the TUI with new data."""
        self.query_one("#tasks_label").update(f"Tasks: {self.task_count}")
        self.query_one("#tasks_mem_label").update(
            f"Tasks Mem: [b]{self.task_memory_size:.2f} KB[/b]"
        )

        self.query_one("#queues_label").update(f"Queues: {self.queue_count}")
        self.query_one("#queues_mem_label").update(
            f"Queues Mem: [b]{self.queue_memory_size:.2f} KB[/b]"
        )

        self.query_one("#users_label").update(f"Users: {self.user_count}")
        self.query_one("#users_mem_label").update(
            f"Users Mem: [b]{self.user_memory_size:.2f} KB[/b]"
        )

        self.query_one("#games_label").update(f"Games: {self.game_count}")
        self.query_one("#games_mem_label").update(
            f"Games Mem: [b]{self.game_memory_size:.2f} KB[/b]"
        )

        self.query_one("#conn_label").update(f"Connections: {self.conn_count}")
        self.query_one("#conn_mem_label").update(f"Conn Mem: [b]{self.conn_memory_size:.2f} KB[/b]")

        # Update sparklines
        self.query_one("#users_sparkline", Sparkline).data = self.user_count_history
        self.query_one("#games_sparkline", Sparkline).data = self.game_count_history
        self.query_one("#tasks_sparkline", Sparkline).data = self.task_count_history
        self.query_one("#conn_sparkline", Sparkline).data = self.conn_count_history
        self.query_one("#queues_sparkline", Sparkline).data = self.queue_count_history

        # Update allocation table
        alloc_table = self.query_one("#alloc_table", DataTable)
        alloc_table.clear()
        for alloc_type, count, size_bytes, size_human in self.top_allocations:
            alloc_table.add_row(alloc_type, str(count), str(size_bytes), size_human)

        # Update all details tables
        for category in self.categories:
            self.update_category_table(category)

    def update_category_table(self, category: str) -> None:
        """Update the details table for a specific category."""
        table = self.query_one(f"#{category}_table", DataTable)
        table.clear()  # Clear existing rows

        # Define column labels and data keys
        column_configs = {
            "users": [
                ("Title", "title"),
                ("Username", "username"),
                ("Online", "online"),
                ("Last Seen", "last_seen"),
            ],
            "games": [
                ("Game ID", "id"),
                ("Status", "status"),
                ("Players", "players"),
                ("Date", "date"),
            ],
            "tasks": [
                ("Task ID", "id"),
                ("Name", "name"),
                ("State", "state"),
                ("File", "file"),
                ("Source", "source"),
            ],
            "queues": [
                ("Queue ID", "id"),
                ("Name", "name"),
                ("Size", "size"),
                ("File", "file"),
                ("Source", "source"),
            ],
            "connections": [("Conn ID", "id"), ("Timestamp", "timestamp")],
        }

        columns = column_configs.get(category, [])
        base_labels = {lbl: lbl for lbl, _ in columns}

        sort_column = self.sort_columns[category]
        sort_ascending = self.sort_ascendings[category]

        # Update column labels with sort indicators
        for col in table.columns.values():
            base_label = base_labels.get(col.label.plain.strip(" ↑↓"), col.label.plain)
            label = base_label
            if base_label == sort_column:
                label += " ↑" if sort_ascending else " ↓"
            col.label = Text(label)

        # Pre-sort data
        items = self.object_details.get(category, [])

        if sort_column and category in column_configs:
            data_key = next(
                (dk for lbl, dk in column_configs[category] if lbl == sort_column), None
            )
            if data_key:

                def sort_key(item):
                    value = item.get(data_key, "")
                    if data_key in ["last_seen", "date", "timestamp"] and value:
                        return datetime.fromisoformat(value)
                    elif data_key == "players":
                        return ", ".join(value) if value else ""
                    elif data_key == "online":
                        return 1 if value else 0
                    return value or ""

                try:
                    items = sorted(items, key=sort_key, reverse=not sort_ascending)
                except Exception as e:
                    self.notify(f"Sort failed: {e}", title="Error", severity="error", timeout=3)

        # Format dates and update rows
        def format_date(value):
            try:
                return datetime.fromisoformat(value).strftime("%m/%d/%Y %H:%M") if value else "-"
            except (ValueError, TypeError):
                return "-"

        if category == "users":
            for user in items:
                online_icon = "🟢" if user["online"] else "⚪"
                table.add_row(
                    str(user.get("title", "-")),
                    user.get("username", "-"),
                    online_icon,
                    format_date(user.get("last_seen")),
                )
        elif category == "games":
            for game in items:
                table.add_row(
                    str(game.get("id", "-")),
                    game.get("status", "-"),
                    ", ".join(game.get("players", [])) if game.get("players") else "-",
                    format_date(game.get("date")),
                )
        elif category == "tasks":
            for task in items:
                table.add_row(
                    task.get("id", "-"),
                    task.get("name", "-"),
                    task.get("state", "-"),
                    task.get("file", "-"),
                    task.get("source", "-"),
                )
        elif category == "queues":
            for queue in items:
                table.add_row(
                    queue.get("id", "-"),
                    queue.get("name", "-"),
                    queue.get("size", "-"),
                    queue.get("file", "-"),
                    queue.get("source", "-"),
                )
        elif category == "connections":
            for conn in items:
                table.add_row(str(conn.get("id", "-")), format_date(conn.get("timestamp")))

        table.refresh()

    def on_switch_changed(self, event: Switch.Changed) -> None:
        if event.switch.id == "monitoring":
            self.monitoring = not self.monitoring

    def on_data_table_header_selected(self, event: DataTable.HeaderSelected) -> None:
        """Handle column header clicks for sorting."""
        table_id = event.data_table.id
        if table_id.endswith("_table"):
            category = table_id[:-6]  # remove '_table'
            if category in self.sort_columns:
                column_key = event.column_key
                if self.sort_columns[category] == column_key:
                    self.sort_ascendings[category] = not self.sort_ascendings[category]
                else:
                    self.sort_columns[category] = column_key
                    self.sort_ascendings[category] = True
                self.update_category_table(category)


if __name__ == "__main__":
    app = MemoryMonitorApp()
    app.run()
