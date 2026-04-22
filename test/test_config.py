import json
import tempfile
import unittest
from pathlib import Path

from services.user_service import UserService


ROOT_DIR = Path(__file__).resolve().parents[1]
ROOT_CONFIG_FILE = ROOT_DIR / "config.json"


class ConfigLoadingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls._created_root_config = False
        if not ROOT_CONFIG_FILE.exists():
            ROOT_CONFIG_FILE.write_text(json.dumps({"auth-key": "test-auth"}), encoding="utf-8")
            cls._created_root_config = True

        from services import config as config_module

        cls.config_module = config_module

    @classmethod
    def tearDownClass(cls) -> None:
        if cls._created_root_config and ROOT_CONFIG_FILE.exists():
            ROOT_CONFIG_FILE.unlink()

    def test_load_settings_ignores_directory_config_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            base_dir = Path(tmp_dir)
            data_dir = base_dir / "data"
            config_dir = base_dir / "config.json"
            os_auth_key = "env-auth"

            config_dir.mkdir()

            module = self.config_module
            old_base_dir = module.BASE_DIR
            old_data_dir = module.DATA_DIR
            old_config_file = module.CONFIG_FILE
            old_env_auth_key = module.os.environ.get("CHATGPT2API_AUTH_KEY")
            try:
                module.BASE_DIR = base_dir
                module.DATA_DIR = data_dir
                module.CONFIG_FILE = config_dir
                module.os.environ["CHATGPT2API_AUTH_KEY"] = os_auth_key

                settings = module._load_settings()

                self.assertEqual(settings.auth_key, os_auth_key)
                self.assertEqual(settings.refresh_account_interval_minute, 60)
            finally:
                module.BASE_DIR = old_base_dir
                module.DATA_DIR = old_data_dir
                module.CONFIG_FILE = old_config_file
                if old_env_auth_key is None:
                    module.os.environ.pop("CHATGPT2API_AUTH_KEY", None)
                else:
                    module.os.environ["CHATGPT2API_AUTH_KEY"] = old_env_auth_key


class LocalUserServiceTests(unittest.TestCase):
    def test_register_login_session_and_redeem(self) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            base = Path(tmp_dir)
            service = UserService(base / "users.json", base / "redeem_keys.json")

            created = service.register_user("alice", "secret123", quota=0)
            self.assertEqual(created["username"], "alice")
            self.assertEqual(created["quota"], 0)

            self.assertIsNotNone(service.authenticate_user("alice", "secret123"))
            self.assertIsNone(service.authenticate_user("alice", "wrong-password"))

            token = service.create_session("alice")
            me = service.get_user_by_session(token)
            self.assertIsNotNone(me)

            keys = service.generate_redeem_keys(amount=2, quantity=2)
            key_values = [str(item["key"]) for item in keys]
            redeemed = service.redeem_keys("alice", [key_values[0], key_values[1], "missing"])
            self.assertEqual(redeemed["redeemed"], 2)
            self.assertEqual(redeemed["amount"], 4)

            user_id = str(created["id"])
            consumed = service.consume_user_quota(user_id, 3)
            self.assertIsNotNone(consumed)
            if consumed is not None:
                self.assertEqual(consumed["quota"], 1)


if __name__ == "__main__":
    unittest.main()
