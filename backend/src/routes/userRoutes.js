import express from 'express';
import { verifyToken } from '../middleware/verifyToken.js';
import {
    register,
    getUserList,
    getUserById,
    searchUsersByName,
    getFriendStatus,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    unfriend,
    listFriends,
    getFriendRequests,
} from '../controllers/userController.js';

const router = express.Router();

router.post('/', register);

router.use(verifyToken);

router.get('/list', getUserList);
router.get('/search', searchUsersByName);
router.get('/friend-requests', getFriendRequests);
router.get('/:id/friends', listFriends);
router.get('/:id/friend-status', getFriendStatus);
router.post('/:id/friend-request', sendFriendRequest);
router.post('/:id/friend-accept', acceptFriendRequest);
router.post('/:id/friend-reject', rejectFriendRequest);
router.post('/:id/friend-cancel', cancelFriendRequest);
router.post('/:id/unfriend', unfriend);
router.get('/:id', getUserById);

export default router;
