import mongoose from 'mongoose';
import User from '../models/User.js';

const USER_PUBLIC_FIELDS = '_id first_name last_name';
const USER_DETAIL_FIELDS =
    '_id first_name last_name location description occupation login_name friends incomingRequests outgoingRequests';

const FULL_PUBLIC_FIELDS =
    '_id first_name last_name location description occupation login_name';

const toStr = (id) => id?.toString();
const hasId = (list = [], id) => list.some((v) => toStr(v) === toStr(id));
const removeId = (list = [], id) => list.filter((v) => toStr(v) !== toStr(id));
const ensureObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

// Get /user/list
export async function getUserList(req, res) {
    try {
        const users = await User.find({}, USER_PUBLIC_FIELDS).lean();
        return res.status(200).json(users);
    } catch (error) {
        console.error('Error fetching user list:', error);
        return res.status(500).json({ error: error.message });
    }
}

//Get /user/:id
export async function getUserById(req, res) {
    try {
        const userId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ error: 'Invalid user id' });
        }
        const user = await User.findById(userId, USER_DETAIL_FIELDS).lean();
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.status(200).json(user);
    } catch (error) {
        console.error('Error fetching user by ID:', error);
        return res.status(500).json({ error: error.message });
    }
}

// GET /user/search?name=...
export async function searchUsersByName(req, res) {
    try {
        const nameQuery = req.query.name;
        if (!nameQuery || typeof nameQuery !== 'string' || nameQuery.trim() === '') {
            return res.status(400).json({ error: 'name query parameter is required' });
        }

        const regex = new RegExp(nameQuery.trim(), 'i');
        const users = await User.find(
            {
                $or: [
                    { first_name: { $regex: regex } },
                    { last_name: { $regex: regex } },
                ],
            },
            USER_PUBLIC_FIELDS
        ).lean();

        return res.status(200).json(users);
    } catch (error) {
        console.error('Error searching users by name:', error);
        return res.status(500).json({ error: error.message });
    }
}

// POST /user
export async function register(req, res) {
    try {
        const {
            login_name,
            password,
            first_name,
            last_name,
            location = "",
            description = "",
            occupation = "",
        } = req.body || {};

        // Validate theo spec: login_name unique, password/first/last non-empty
        if (!login_name || typeof login_name !== 'string' || login_name.trim() === '') {
            return res.status(400).json({ error: 'login_name is required' });
        }
        if (!password || typeof password !== 'string' || password.trim() === '') {
            return res.status(400).json({ error: 'password is required' });
        }
        if (!first_name || typeof first_name !== 'string' || first_name.trim() === '') {
            return res.status(400).json({ error: 'first_name is required' });
        }
        if (!last_name || typeof last_name !== 'string' || last_name.trim() === '') {
            return res.status(400).json({ error: 'last_name is required' });
        }

        const existed = await User.findOne({ login_name: login_name.trim() }).lean();
        if (existed) {
            return res.status(400).json({ error: 'login_name already exists' });
        }

        const user = await User.create({
            login_name: login_name.trim(),
            password: password.trim(),
            first_name: first_name.trim(),
            last_name: last_name.trim(),
            location,
            description,
            occupation,
        });

        return res.status(200).json({
            _id: user._id,
            login_name: user.login_name,
            first_name: user.first_name,
            last_name: user.last_name,
            location: user.location,
            description: user.description,
            occupation: user.occupation,
            role: user.role,
        });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(400).json({ error: 'login_name already exists' });
        }
        console.error('Error register:', error);
        return res.status(500).json({ error: error.message });
    }
}

export async function getFriendStatus(req, res) {
    try {
        const targetId = req.params.id;
        const currentId = req.user?._id;

        if (!ensureObjectId(targetId)) {
            return res.status(400).json({ error: 'Invalid user id' });
        }
        if (!currentId) return res.sendStatus(401);

        if (toStr(targetId) === toStr(currentId)) {
            return res.status(200).json({ status: 'self' });
        }

        const [currentUser, targetUser] = await Promise.all([
            User.findById(currentId, 'friends incomingRequests outgoingRequests'),
            User.findById(targetId, '_id'),
        ]);

        if (!targetUser) return res.status(404).json({ error: 'User not found' });
        if (!currentUser) return res.sendStatus(401);

        if (hasId(currentUser.friends, targetId)) {
            return res.status(200).json({ status: 'friends' });
        }
        if (hasId(currentUser.incomingRequests, targetId)) {
            return res.status(200).json({ status: 'incoming' });
        }
        if (hasId(currentUser.outgoingRequests, targetId)) {
            return res.status(200).json({ status: 'outgoing' });
        }

        return res.status(200).json({ status: 'none' });
    } catch (error) {
        console.error('Error getting friend status:', error);
        return res.status(500).json({ error: error.message });
    }
}

export async function sendFriendRequest(req, res) {
    try {
        const targetId = req.params.id;
        const currentId = req.user?._id;

        if (!currentId) return res.sendStatus(401);
        if (!ensureObjectId(targetId)) {
            return res.status(400).json({ error: 'Invalid user id' });
        }
        if (toStr(targetId) === toStr(currentId)) {
            return res.status(400).json({ error: 'Cannot friend yourself' });
        }

        const [currentUser, targetUser] = await Promise.all([
            User.findById(currentId),
            User.findById(targetId),
        ]);

        if (!currentUser) return res.sendStatus(401);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        if (hasId(currentUser.friends, targetId)) {
            return res.status(400).json({ error: 'Already friends' });
        }

        // If they already sent us a request, accept it instead.
        if (hasId(currentUser.incomingRequests, targetId)) {
            currentUser.incomingRequests = removeId(currentUser.incomingRequests, targetId);
            targetUser.outgoingRequests = removeId(targetUser.outgoingRequests, currentId);

            if (!hasId(currentUser.friends, targetId)) currentUser.friends.push(targetId);
            if (!hasId(targetUser.friends, currentId)) targetUser.friends.push(currentId);

            await Promise.all([currentUser.save(), targetUser.save()]);
            return res.status(200).json({ status: 'friends' });
        }

        if (hasId(currentUser.outgoingRequests, targetId) || hasId(targetUser.incomingRequests, currentId)) {
            return res.status(400).json({ error: 'Request already sent' });
        }

        currentUser.outgoingRequests.push(targetId);
        targetUser.incomingRequests.push(currentId);

        await Promise.all([currentUser.save(), targetUser.save()]);

        return res.status(200).json({ status: 'outgoing' });
    } catch (error) {
        console.error('Error sending friend request:', error);
        return res.status(500).json({ error: error.message });
    }
}

export async function acceptFriendRequest(req, res) {
    try {
        const requesterId = req.params.id;
        const currentId = req.user?._id;

        if (!currentId) return res.sendStatus(401);
        if (!ensureObjectId(requesterId)) {
            return res.status(400).json({ error: 'Invalid user id' });
        }

        const [currentUser, requester] = await Promise.all([
            User.findById(currentId),
            User.findById(requesterId),
        ]);

        if (!currentUser) return res.sendStatus(401);
        if (!requester) return res.status(404).json({ error: 'User not found' });

        if (!hasId(currentUser.incomingRequests, requesterId)) {
            return res.status(400).json({ error: 'No request to accept' });
        }

        currentUser.incomingRequests = removeId(currentUser.incomingRequests, requesterId);
        requester.outgoingRequests = removeId(requester.outgoingRequests, currentId);

        if (!hasId(currentUser.friends, requesterId)) currentUser.friends.push(requesterId);
        if (!hasId(requester.friends, currentId)) requester.friends.push(currentId);

        await Promise.all([currentUser.save(), requester.save()]);

        return res.status(200).json({ status: 'friends' });
    } catch (error) {
        console.error('Error accepting friend request:', error);
        return res.status(500).json({ error: error.message });
    }
}

export async function rejectFriendRequest(req, res) {
    try {
        const requesterId = req.params.id;
        const currentId = req.user?._id;

        if (!currentId) return res.sendStatus(401);
        if (!ensureObjectId(requesterId)) {
            return res.status(400).json({ error: 'Invalid user id' });
        }

        const [currentUser, requester] = await Promise.all([
            User.findById(currentId),
            User.findById(requesterId),
        ]);

        if (!currentUser) return res.sendStatus(401);
        if (!requester) return res.status(404).json({ error: 'User not found' });

        currentUser.incomingRequests = removeId(currentUser.incomingRequests, requesterId);
        requester.outgoingRequests = removeId(requester.outgoingRequests, currentId);

        await Promise.all([currentUser.save(), requester.save()]);

        return res.status(200).json({ status: 'none' });
    } catch (error) {
        console.error('Error rejecting friend request:', error);
        return res.status(500).json({ error: error.message });
    }
}

export async function cancelFriendRequest(req, res) {
    try {
        const targetId = req.params.id;
        const currentId = req.user?._id;

        if (!currentId) return res.sendStatus(401);
        if (!ensureObjectId(targetId)) {
            return res.status(400).json({ error: 'Invalid user id' });
        }

        const [currentUser, targetUser] = await Promise.all([
            User.findById(currentId),
            User.findById(targetId),
        ]);

        if (!currentUser) return res.sendStatus(401);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        currentUser.outgoingRequests = removeId(currentUser.outgoingRequests, targetId);
        targetUser.incomingRequests = removeId(targetUser.incomingRequests, currentId);

        await Promise.all([currentUser.save(), targetUser.save()]);

        return res.status(200).json({ status: 'none' });
    } catch (error) {
        console.error('Error cancelling friend request:', error);
        return res.status(500).json({ error: error.message });
    }
}

export async function unfriend(req, res) {
    try {
        const targetId = req.params.id;
        const currentId = req.user?._id;

        if (!currentId) return res.sendStatus(401);
        if (!ensureObjectId(targetId)) {
            return res.status(400).json({ error: 'Invalid user id' });
        }

        const [currentUser, targetUser] = await Promise.all([
            User.findById(currentId),
            User.findById(targetId),
        ]);

        if (!currentUser) return res.sendStatus(401);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        currentUser.friends = removeId(currentUser.friends, targetId);
        targetUser.friends = removeId(targetUser.friends, currentId);

        currentUser.incomingRequests = removeId(currentUser.incomingRequests, targetId);
        currentUser.outgoingRequests = removeId(currentUser.outgoingRequests, targetId);
        targetUser.incomingRequests = removeId(targetUser.incomingRequests, currentId);
        targetUser.outgoingRequests = removeId(targetUser.outgoingRequests, currentId);

        await Promise.all([currentUser.save(), targetUser.save()]);

        return res.status(200).json({ status: 'none' });
    } catch (error) {
        console.error('Error removing friend:', error);
        return res.status(500).json({ error: error.message });
    }
}

export async function listFriends(req, res) {
    try {
        const userId = req.params.id;
        if (!ensureObjectId(userId)) {
            return res.status(400).json({ error: 'Invalid user id' });
        }
        const user = await User.findById(userId, 'friends').lean();
        if (!user) return res.status(404).json({ error: 'User not found' });

        const friends = await User.find(
            { _id: { $in: user.friends || [] } },
            USER_PUBLIC_FIELDS
        ).lean();

        return res.status(200).json(friends || []);
    } catch (error) {
        console.error('Error listing friends:', error);
        return res.status(500).json({ error: error.message });
    }
}

export async function getFriendRequests(req, res) {
    try {
        const currentId = req.user?._id;
        if (!currentId) return res.sendStatus(401);

        const user = await User.findById(
            currentId,
            'incomingRequests outgoingRequests'
        ).lean();
        if (!user) return res.sendStatus(401);

        const [incoming, outgoing] = await Promise.all([
            User.find({ _id: { $in: user.incomingRequests || [] } }, FULL_PUBLIC_FIELDS).lean(),
            User.find({ _id: { $in: user.outgoingRequests || [] } }, FULL_PUBLIC_FIELDS).lean(),
        ]);

        return res.status(200).json({
            incoming: incoming || [],
            outgoing: outgoing || [],
        });
    } catch (error) {
        console.error('Error fetching friend requests:', error);
        return res.status(500).json({ error: error.message });
    }
}
