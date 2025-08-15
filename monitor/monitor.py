import aiohttp
from textual.app import App, ComposeResult
from textual.widgets import Header, Footer, DataTable, Button, Label, Sparkline
from textual.containers import Vertical, Horizontal
from textual.reactive import reactive
from rich.text import Text
from datetime import datetime


class MemoryMonitorApp(App):
    """Textual TUI app to monitor aiohttp server memory usage and object usage."""

    CSS_PATH = "monitor.css"

    # Reactive variables for updating UI
    conn_count = reactive(0)
    server_pid = reactive(0)
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
    selected_category = reactive("none")
    object_details = reactive({"users": [], "games": [], "tasks": [], "queues": [], "connections": []})

    # Historical data for sparklines
    conn_count_history = reactive([])
    user_count_history = reactive([])
    game_count_history = reactive([])
    task_count_history = reactive([])
    queue_count_history = reactive([])

    # Sorting state
    sort_column = reactive(None)
    sort_ascending = reactive(True)
    # Map ColumnKey objects to string keys
    column_key_map = reactive({})

    def __init__(self):
        super().__init__()
        self.server_url = "http://localhost:8080/metrics"
        self.update_interval = 5
        self.max_history = 100

    def compose(self) -> ComposeResult:
        """Compose the TUI layout."""
        yield Header()
        yield Horizontal(
            Vertical(
                Label("Server PID: [b]{}[/b]".format(self.server_pid), id="pid_label"),

                Button(f"Tasks: {self.task_count}", id="tasks_button"),
                Label(
                    "Taslks Mem: [b]{:.2f} KB[/b]".format(self.task_memory_size),
                    id="tasks_mem_label",
                ),
                Sparkline([], id="tasks_sparkline"),

                Button(f"Queues: {self.queue_count}", id="queues_button"),
                Label(
                    "Queues Mem: [b]{:.2f} KB[/b]".format(self.queue_memory_size),
                    id="queues_mem_label",
                ),
                Sparkline([], id="queues_sparkline"),


                Button(f"Users: {self.user_count}", id="users_button"),
                Label(
                    "Users Mem: [b]{:.2f} KB[/b]".format(self.user_memory_size),
                    id="users_mem_label",
                ),
                Sparkline([], id="users_sparkline"),

                Button(f"Games: {self.game_count}", id="games_button"),
                Label(
                    "Games Mem: [b]{:.2f} KB[/b]".format(self.game_memory_size),
                    id="games_mem_label",
                ),
                Sparkline([], id="games_sparkline"),

                Button(f"Connections: {self.conn_count}", id="conn_button"),
                Label("Conn Mem: [b]{:.2f} KB[/b]".format(self.conn_memory_size), id="conn_mem_label"),
                Sparkline([], id="conn_sparkline"),
                id="left_panel",
            ),
            Vertical(DataTable(id="alloc_table"), DataTable(id="details_table"), id="right_panel"),
        )
        yield Footer()

    async def on_mount(self) -> None:
        """Set up the app on startup."""
        self.query_one("#left_panel").border_title = "App State"
        self.query_one("#alloc_table").border_title = "Alloc Table"
        self.query_one("#details_table").border_title = "Object Detailes"

        # Configure the allocation table
        alloc_table = self.query_one("#alloc_table", DataTable)
        alloc_table.add_columns("Type", "Count", "Size (bytes)", "Size (human)")
        alloc_table.zebra_stripes = True

        # Configure the details table with initial columns
        details_table = self.query_one("#details_table", DataTable)
        details_table.add_column("ID", key="ID")
        details_table.add_column("Details", key="Details")
        # Initialize column_key_map
        self.column_key_map = {col.key: col.label.plain for i, col in enumerate(details_table.columns.values())}
        details_table.zebra_stripes = True
        details_table.cursor_type = "row"
        details_table.show_header = True
        details_table.show_cursor = True
        details_table.fixed_rows = 0
        details_table.focus()

        # Start periodic updates
        self.set_interval(self.update_interval, self.update_metrics)

    async def update_metrics(self) -> None:
        """Fetch server metrics and update UI."""
        async with aiohttp.ClientSession() as session:
            try:
                async with session.get(self.server_url) as response:
                    if response.status == 200:
                        data = await response.json()
                        self.server_pid = data.get("pid", 0)

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
                        self.object_details = data.get("object_details", {"users": [], "games": [], "tasks": [], "connections": []})

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
        self.query_one("#pid_label").update(f"Server PID: [b]{self.server_pid}[/b]")

        self.query_one("#tasks_button").label = f"Tasks: {self.task_count}"
        self.query_one("#tasks_mem_label").update(f"Tasks Mem: [b]{self.task_memory_size:.2f} KB[/b]")

        self.query_one("#queues_button").label = f"Queues: {self.queue_count}"
        self.query_one("#queues_mem_label").update(f"Queues Mem: [b]{self.queue_memory_size:.2f} KB[/b]")

        self.query_one("#users_button").label = f"Users: {self.user_count}"
        self.query_one("#users_mem_label").update(f"Users Mem: [b]{self.user_memory_size:.2f} KB[/b]")

        self.query_one("#games_button").label = f"Games: {self.game_count}"
        self.query_one("#games_mem_label").update(f"Games Mem: [b]{self.game_memory_size:.2f} KB[/b]")

        self.query_one("#conn_button").label = f"Connections: {self.conn_count}"
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
        for file, line, size, traceback in self.top_allocations:
            alloc_table.add_row(file, str(line), f"{size:.2f}", traceback)

        # Update details table
        self.update_details_table()

    def update_details_table(self) -> None:
        """Update the details table based on the selected category."""
        details_table = self.query_one("#details_table", DataTable)
        details_table.clear()  # Clear existing rows

        # Clear existing columns and set up new ones
        for col_key in list(details_table.columns.keys()):
            details_table.remove_column(col_key)

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
            "none": [("ID", None), ("Details", None)],
        }

        # Add columns based on category
        columns = column_configs.get(self.selected_category, column_configs["none"])
        for label, _ in columns:
            details_table.add_column(label, key=label)

        # Update column_key_map
        self.column_key_map = {col.key: col.label.plain for col in details_table.columns.values()}

        # Validate sort_column using base labels
        base_labels = {lbl: lbl for lbl, _ in columns}
        if self.sort_column not in base_labels:
            self.sort_column = None

        # Update column labels with sort indicators
        for col in details_table.columns.values():
            base_label = base_labels.get(col.label.plain.strip(" ↑↓"), col.label.plain)
            label = base_label
            if base_label == self.sort_column:
                label += " ↑" if self.sort_ascending else " ↓"
            details_table.columns[col.key].label = Text(label)

        # Pre-sort data
        items = []
        if self.selected_category in column_configs:
            items = self.object_details.get(self.selected_category, [])

        if self.sort_column and self.selected_category in column_configs:
            data_key = next(
                (dk for lbl, dk in column_configs[self.selected_category] if lbl == self.sort_column),
                None,
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
                    items = sorted(items, key=sort_key, reverse=not self.sort_ascending)
                    # self.notify(f"Sorted by {data_key}", title="Sort", severity="information", timeout=2)
                except Exception as e:
                    self.notify(f"Sort failed: {e}", title="Error", severity="error", timeout=3)

        # Format dates and update rows
        def format_date(value):
            try:
                return datetime.fromisoformat(value).strftime("%m/%d/%Y %H:%M") if value else "-"
            except (ValueError, TypeError):
                return "-"

        row_keys = []
        if self.selected_category == "users":
            for user in items:
                online_icon = "🟢" if user["online"] else "⚪"
                row_key = details_table.add_row(
                    str(user["title"]),
                    user["username"],
                    online_icon,
                    format_date(user["last_seen"]),
                )
                row_keys.append(row_key)
        elif self.selected_category == "games":
            for game in items:
                row_key = details_table.add_row(
                    str(game["id"]),
                    game["status"],
                    ", ".join(game["players"]) if game["players"] else "-",
                    format_date(game["date"]),
                )
                row_keys.append(row_key)
        elif self.selected_category == "tasks":
            for task in items:
                row_key = details_table.add_row(
                    task["id"],
                    task["name"],
                    task["state"],
                    task["file"],
                    task["source"],
                )
                row_keys.append(row_key)
        elif self.selected_category == "queues":
            for queue in items:
                row_key = details_table.add_row(
                    queue["id"],
                    queue["name"],
                    queue["size"],
                    queue["file"],
                    queue["source"],
                )
                row_keys.append(row_key)
        elif self.selected_category == "connections":
            for conn in items:
                row_key = details_table.add_row(str(conn["id"]), format_date(conn["timestamp"]))
                row_keys.append(row_key)
        else:
            row_key = details_table.add_row("-", "Select a category")
            row_keys.append(row_key)

        details_table.refresh()
        self.refresh()

    def on_button_pressed(self, event: Button.Pressed) -> None:
        """Handle button presses to select a category."""
        button_id = event.button.id
        details_table = self.query_one("#details_table", DataTable)

        # Reset sorting
        self.sort_column = None
        self.sort_ascending = True

        # Update category
        if button_id == "users_button" and self.selected_category != "users":
            self.selected_category = "users"
        elif button_id == "games_button" and self.selected_category != "games":
            self.selected_category = "games"
        elif button_id == "tasks_button" and self.selected_category != "tasks":
            self.selected_category = "tasks"
        elif button_id == "conn_button" and self.selected_category != "connections":
            self.selected_category = "connections"
        elif button_id == "queues_button" and self.selected_category != "queues":
            self.selected_category = "queues"

        details_table.focus()
        self.update_details_table()

    def on_data_table_header_selected(self, event: DataTable.HeaderSelected) -> None:
        """Handle column header clicks for sorting."""
        column_key = self.column_key_map.get(event.column_key, str(event.column_key))
        if event.data_table.id == "details_table":
            if self.sort_column == column_key.strip(" ↑↓"):
                self.sort_ascending = not self.sort_ascending
            else:
                self.sort_column = column_key.strip(" ↑↓")
                self.sort_ascending = True
            self.update_details_table()
            self.query_one("#details_table", DataTable).refresh()
            self.refresh()


if __name__ == "__main__":
    app = MemoryMonitorApp()
    app.run()
